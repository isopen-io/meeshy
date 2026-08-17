# Cycle 60 — le drapeau que le web décodait pour le jeter

## 1. D'où vient la piste

Pas des huit pistes du cycle 59 : la n°1 (le garde « toute query infinite
paginée par OFFSET porte les deux dérogations ») est **préventive** — ses deux
sujets sont désormais corrects, elle ne protège que la répétition — et la n°2
(`USER_STATUS` retiré de `CLIENT_EVENTS`) est d'une ligne. Le balayage
PHASE 2/PHASE 3 mené à leur place a rendu quelque chose de vivant.

Le fil : `emitConversationPreviewUpdate` (gateway) pose un champ
`previewRecalculated: true` sur ses diffusions, avec un commentaire qui dit
pourquoi — « la garde monotone des clients jette ce cas ». **Quels clients ?**

## 2. Le défaut — une règle appliquée d'un seul côté

`grep previewRecalculated` rend quatre sites côté iOS, un côté web, et le site
web est sa **mise à l'écart** : le champ figure dans `PREVIEW_GROUP_KEYS`,
c'est-à-dire dans la liste des clés que `normalizeConversationPatch` **saute**.

Le web décodait donc le drapeau pour le jeter — et c'était cohérent, puisqu'il
n'avait **aucune garde monotone** à qui il aurait servi d'exception.

### 2.1 Ce que la garde absente laissait passer

Les six écrivains temps réel de `conversation.lastMessage` appliquaient tout ce
qui leur arrivait. Un écrivain qui nomme un message plus ANCIEN que celui que la
ligne décrit la fait donc **reculer** :

- le TEXTE (`lastMessagePreview`), l'AUTEUR (`senderId`) ;
- la carte du Prisme (`lastMessageTranslations` / `lastMessageOriginalLanguage`),
  donc la langue dans laquelle la ligne est lue ;
- et le **RANG** : `useConversationSorting` délègue à `sortConversations`, qui
  trie sur `lastMessageAt` décroissant. Une ligne qui recule **descend dans la
  liste**.

`staleTime: Infinity` : rien ne repasse corriger.

### 2.2 Le désordre n'est pas une course exotique — il y en a DEUX, ordinaires

**(a) Le chemin `conversation:updated`.** `MessageHandler` diffuse `message:new`
dans la room de CONVERSATION, puis `conversation:updated` dans la room USER de
chaque participant. Entre les deux :

```ts
sharedParticipants = await this.prisma.participant.findMany({ … });
```

Un `await` sur une requête base. Deux envois concurrents dans le même fil
sortent donc leurs `conversation:updated` **dans l'ordre de leurs requêtes**,
pas dans celui de leurs messages. Le dernier arrivé gagne, et il peut être le
plus ancien.

**(b) Le chemin `message:new`.** Sur une conversation absente du cache,
`handleNewMessage` déclenche un `GET /conversations/:id` puis estampille son
propre message par-dessus la ligne rendue par le serveur. Deux messages rapides
dans un DM tout neuf lancent **deux** fetches, et rien n'ordonne leurs
résolutions : la ligne d'un DM tout neuf pouvait rester sur le **premier**
message reçu, pour de bon.

### 2.3 Pourquoi corriger UN SEUL des deux ne corrigeait rien

Même forme qu'au cycle 59 §2.3, sur un autre couple. (a) et (b) pendent au
**même geste** — un message envoyé — et arrivent tous deux sur la même ligne :
désarmer (a) laisse (b) la faire reculer, et réciproquement. La garde devait
être posée sur les deux familles d'écrivains, ou sur aucune.

## 3. Le correctif

Une règle, exprimée deux fois parce que les deux familles ne reçoivent pas la
même chose (un `Message` d'un côté, un payload non typé de l'autre) :

1. **`withArrivedMessage({ conversation, message })`** — rend `null` quand la
   ligne décrit déjà un message plus récent. Les **trois** écrivains d'une
   arrivée y passent : `handleNewMessage` (branche en cache **et** branche
   fetch), `handleLinkMessageNew`, et le sixième écrivain
   (`use-conversations-v2.ts`, un second écouteur du même `message:new`).
2. **`mergeConversationUpdate`** — même garde sur `conversation:updated`, en
   retirant du patch le groupe MONOTONE (`lastMessageAt`,
   `lastMessageTranslations`, `lastMessageOriginalLanguage`) en même temps que
   le groupe d'aperçu : sinon la ligne garderait le rang et la carte d'un
   message dont elle vient de refuser le texte.

### 3.1 Les deux bornes, sans lesquelles la garde casse le chemin nominal

- **L'ÉGALITÉ n'est pas un recul.** C'est le même message, donc une ÉDITION. Un
  `>` strict aurait jeté le seul chemin qui en a besoin — c'est l'erreur exacte
  qu'iOS a commise avant son `>=`, écrite en toutes lettres à côté du code à
  porter.
- **L'IDENTITÉ prime sur l'horodatage.** Un écrivain qui nomme le message de la
  ligne n'est jamais périmé. Sans cela, le `conversation:updated` jumeau de
  chaque `message:new` — même id, même date — se serait fait jeter sur le chemin
  le plus fréquenté du service.

### 3.2 Les deux exemptions, et pourquoi elles ne se déduisent pas du contenu

- **`previewRecalculated: true`** : le serveur déclare avoir RECALCULÉ l'aperçu
  depuis sa base. Un tel aperçu recule LÉGITIMEMENT — supprimer pour tous le
  dernier message fait redescendre la ligne sur le précédent, et masquer pour
  soi son dernier message visible sert un remplaçant plus ancien **par
  construction**. Du seul contenu, un recul légitime et une diffusion tardive
  sont indiscernables : le discriminant ne peut venir que de l'émetteur. Le
  drapeau est enfin LU.
- **`advanceConversationPreviewOnDelete`** : recalcul LOCAL après une
  suppression, même raison, et il n'appelle pas la garde.

La pastille de non-lus n'est pas dans le groupe : elle compte des MESSAGES et
non des rangs, et monte donc même quand l'aperçu ne bouge pas
(`use-conversations-v2.ts`).

## 4. Gates

| Gate | Résultat |
|------|----------|
| Suite web COMPLÈTE | **593 suites / 12 543 témoins verts**, 21 ignorés, sortie 0 (cycle 59 : 592/12 530 — +1 suite, +13 témoins) |
| `tsc --noEmit` web | **1235 erreurs**, identique à la base de `main` ; **zéro** sur les fichiers touchés |
| ESLint (local `v9.39.5`) | `use-socket-cache-sync.ts` 8 erreurs, `use-conversations-v2.ts` 9 — **identique à `main`**, toutes préexistantes, aucune sur une ligne touchée |
| ROUGE prouvé | Groupe `mergeConversationUpdate` : 6/10 témoins échouent sans le correctif (les 4 verts sont les cas no-op, attendus). Handler : le témoin de garde échoue, les 2 témoins de non-régression passent |

Note d'outillage : `npx eslint` résout ESLint **10.1.0** depuis
`/opt/node22` et plante sur `react/display-name` — c'est la panne de la leçon
223, pas un défaut du dépôt. Utiliser `./node_modules/.bin/eslint` (v9.39.5,
la version pinnée).

## 5. Ce qui n'est PAS livré

- **Le garde de forme « query infinite OFFSET ⇒ deux dérogations »** (cycle 59
  piste n°1) — préventif, ses deux sujets sont corrects. Reporté.
- **`USER_STATUS` retiré de `CLIENT_EVENTS`** — une ligne, cosmétique. Reporté.
- **iOS** — rien à porter : c'est la source de la règle, et elle y est complète.

## 6. Pistes pour le cycle 61

1. **Le troisième client — dépouillé, et il change la piste.** La question
   « Android porte-t-il la garde monotone ? » a été posée AVANT d'ouvrir la PR,
   parce que c'est exactement la forme que ce cycle vient de fermer. Réponse :
   **il n'en a pas besoin**. `ConversationListViewModel` (`feature/conversations`)
   n'applique AUCUN payload au cache de liste — ses trois abonnements
   (`messageReceived`, `conversationUpdated`, `unreadUpdated`) appellent tous
   `refreshSilently()`, une relecture serveur complète. Le serveur reste donc la
   source de vérité de la ligne, et aucun désordre de diffusion ne peut la faire
   reculer : Android est **structurellement immunisé**, comme les neuf queries
   infinite keyset l'étaient au cycle 59 §7.1.

   Le tableau de parité (`apps/android/tasks/audit/part-17.md`) décrit pourtant
   un relais « upsert + bump conversation to top » vers `CacheCoordinator` : c'est
   un plan de PORTAGE, pas du code livré. **Le jour où ce relais existera, il
   naîtra avec le défaut** — et la garde devra naître avec lui. À noter dans le
   plan avant qu'il ne soit exécuté, pas après.

   Ce que la réponse fait apparaître à la place, et qui est la vraie piste :
   `refreshSilently()` sur CHAQUE message entrant est une requête de liste
   complète par message reçu. C'est le coût que le web ne paie qu'au reconnect,
   et qu'il a précisément passé les cycles 59 et 60 à borner. **Piste de
   performance Android, nouvelle et chiffrable.**
2. **Le garde de forme des queries infinite OFFSET** (cycle 59 §6, §7.1) —
   intacte, entièrement instruite.
3. **`USER_STATUS` retiré de `CLIENT_EVENTS`** (cycle 59 §7) — intacte.
4. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte, plusieurs cycles.
5. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, pas correctif.
6. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
7. **Le code mort des trois hooks de préférences React Query** (cycle 55) — intacte.
8. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
9. **`PUT /conversations/:id` accepte toujours de renommer un DM** — cosmétique.
10. **Les DEUX sockets web sont-elles la bonne architecture ?** (cycle 58 §8-8) —
    intacte. Ce cycle ajoute un troisième argument : ce n'était pas deux sockets,
    ni deux rattrapages (cycle 59), mais **deux clients** d'une même règle
    serveur. La classe « corrigé d'un côté, pas de l'autre » traverse toutes les
    frontières du produit, et c'est la seule constante des dix derniers cycles.
