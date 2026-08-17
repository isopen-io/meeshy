# Cycle 60 — la dérogation ne protégeait de rien : le préfixe avait trois autres portes

## 1. D'où vient la piste

Du carnet du cycle 59, mais pas de ses pistes.

Le cycle 59 a fermé UNE invalidation destructrice (`useInvalidateOnReconnect`)
et posé les deux dérogations (`refetchOnWindowFocus: false` +
`refetchOnReconnect: false`) sur `useInfiniteConversationsQuery`. Sa piste n°1
pour ce cycle était le garde « toute query infinite paginée par OFFSET porte les
deux dérogations ».

Le balayage préalable de ce garde a rendu autre chose, et de plus grave : **les
deux dérogations ne protègent de RIEN contre un `invalidateQueries` explicite.**
Elles désarment les deux déclencheurs *globaux* du QueryClient. Un appel direct
sur un préfixe de la clé passe à travers, et il en restait **trois** dans
`use-socket-cache-sync.ts`.

Le garde de la piste n°1 aurait donc été posé, serait passé VERT, et n'aurait
rien attrapé — sur exactement le défaut qu'il croyait garder.

## 2. Le défaut — le préfixe, et ce qu'il atteint

```
queryKeys.conversations.all        = ['conversations']
queryKeys.conversations.infinite() = ['conversations', 'infinite']
```

Le premier est un **PRÉFIXE** du second. `invalidateQueries({ queryKey:
queryKeys.conversations.all })` atteint donc la liste infinie, et sur une query
infinie ACTIVE — elle l'est dès que la sidebar est montée — elle **rejoue TOUTES
les pages chargées et REMPLACE le cache**. Les trois dommages sont ceux que le
cycle 59 a instruits :

1. N pages de scroll = N requêtes sur une route lourde (participants, dernier
   message avec traductions et pièce jointe, compteurs de non-lus calculés par
   curseur) ;
2. tout ce que la socket écrit pendant la séquence est **ÉCRASÉ** ;
3. la route pagine par **OFFSET** sur un tri `lastMessageAt` décroissant : un
   message arrivé entre la page k et la page k+1 promeut sa conversation en tête
   et décale les suivantes d'un cran — **une ligne dupliquée à la frontière, une
   autre perdue**.

Le troisième n'est pas un coût, c'est une faute de correction.

Ce cycle n'a donc pas découvert un nouveau mécanisme de dommage. Il a découvert
que le mécanisme du cycle 59 avait **trois portes de plus**, sur des
déclencheurs SOCKET au lieu de déclencheurs réseau — et que la défense posée au
cycle 59 ne les couvrait pas par construction.

### 2.1 Site A — la file hors-ligne vidée, et la règle écrite EN CAPITALES vingt lignes plus haut

C'est le cœur du cycle, et la forme la plus pure de la classe de défauts que ce
dépôt produit.

Au reconnect, `MeeshySocketIOManager` vide la file de livraison :

```ts
for (const entry of pending) {
  for (const emission of _drainedEmissions(entry)) {
    userRoom.emit(emission.event, emission.payload);      // message:new, edited, …
  }
}
userRoom.emit(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, { count, conversationIds });
```

L'ordre est celui-là : **d'abord** chaque message rejoué, **ensuite** l'annonce.

Chaque rejeu est donc déjà passé par `handleNewMessage`, qui écrit la ligne de
liste sans la remplacer (aperçu, `lastMessageAt`, promotion en tête) — et qui
porte ceci, en capitales, dans son propre corps :

> ```ts
> // DO NOT invalidate here - setQueryData already has the correct lastMessage
> // Invalidating would trigger a re-fetch that could return stale data from backend cache
> ```

`handlePendingMessagesDelivered`, le handler d'à côté, faisait exactement
l'inverse — et sur un préfixe **plus large** :

```ts
// Always refresh conversation list to update lastMessageAt / unread counts
queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
```

Il effaçait donc, par rejeu de pages, les écritures que le handler précédent
venait de poser, message par message. Son propre commentaire annonce d'ailleurs
la bonne intention à la ligne du dessus — « Use targeted per-conversation
invalidation to avoid a broad cache flush » — appliquée à la moitié MESSAGES et
démentie sur la moitié CONVERSATIONS de la même fonction.

C'est le chemin le plus fréquenté des trois : toute reconnexion où l'utilisateur
avait des messages en attente, c'est-à-dire plusieurs fois par trajet sur un
usage mobile.

### 2.2 Ce que l'invalidation servait VRAIMENT — la pastille, et elle seule

Le point qui a failli faire livrer une régression.

L'invalidation prétendait rafraîchir « lastMessageAt / unread counts ». La
moitié `lastMessageAt` est déjà arrivée par socket (§2.1). Reste la **pastille de
non-lus**, et elle n'arrive PAS : `_drainedEventName` mappe chaque entrée de file
vers un événement de MESSAGE — `message:new`, `edited`, `deleted`, `reaction-*`,
`attachment-updated`, `translation`, `pinned`, `unpinned` — et n'a **aucun cas**
`conversation:unread-updated`. Le compteur reste celui d'avant la coupure, et
seul le serveur peut le calculer.

Donc : supprimer l'invalidation sèchement aurait fermé le dommage et perdu la
pastille.

**La fausse bonne idée, écartée pour une raison mesurable.** Router ce handler
vers `useConversationsDeltaSync` (le rattrapage borné, la réponse du cycle 59 au
même besoin) semblait évident. Elle ne marche pas ici, et c'est instructif : le
watermark du delta est **DÉDUIT du cache** (`conversationDeltaWatermark` = max des
`updatedAt` en cache), et `handleNewMessage` vient précisément d'écrire
`updatedAt: message.createdAt` sur les conversations concernées. Le watermark a
donc déjà **dépassé** le changement à rattraper : un `updatedSince` en borne
stricte `gt` ne rendrait **rien**, et la pastille ne viendrait jamais.

Le module `delta-sync.ts` affirme en en-tête, à raison, qu'« un event socket qui
écrit dans le cache ne peut que faire AVANCER `T` — jamais le corrompre ». C'est
une garantie de **sûreté** (on ne rate rien de ce que le serveur porte sur
`updatedAt`). Elle a un corollaire que le fichier ne tire pas : une écriture
socket qui avance `T` rend le delta **aveugle aux faits serveur attachés au même
changement que la socket n'a PAS portés**. La pastille est exactement ce cas.

### 2.3 Site B — la redondance pure, où le serveur faisait déjà le travail, mieux

`handleMessagesRestoredForMe` invalidait le même préfixe, en se justifiant ainsi :
« l'aperçu du dernier message peut redevenir celui qu'on avait masqué ».

C'est vrai, et c'est déjà fait — par le serveur, sur le même geste. Côté gateway,
`restoreMessageForUser` :

```ts
broadcastToUser(fastify, userId, SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, payload);
// Symétrique du masquage : rendre un message peut lui rendre aussi la place
// de dernier message visible de ce lecteur.
await refreshPersonalConversationPreview(fastify, { userId, conversationIds: [...] });
```

`refreshPersonalConversationPreview` → `emitConversationPreviewUpdate` émet un
`conversation:updated` portant l'aperçu **PERSONNEL recalculé** : le dernier
message encore visible *pour ce lecteur-là*, filtré à son prisme linguistique,
borné à sa seule audience (`onlyForReaderUserId`). `handleConversationUpdated` le
fusionne sans remplacer la page.

L'invalidation était donc **purement redondante, et destructrice** : elle
rejouait N pages pour aller rechercher, moins bien et en cassant la pagination,
ce qu'une diffusion socket venait de livrer — contre laquelle elle courait de
surcroît.

### 2.4 Site C — le seul qui se justifie, conservé

`handleConversationNew` invalide le préfixe dans le `.catch` de sa lecture d'une
ligne : la lecture bornée vient d'échouer, et sans elle la conversation
n'apparaît pas du tout. Rejouer les pages coûte cher et peut dupliquer une
frontière ; une ligne manquante à vie coûte plus. **Conservé**, et désormais
documenté comme dernier recours plutôt que laissé à l'identique des trois autres.

### 2.5 Trois témoins verrouillaient le défaut

Comme au cycle 59 (§4.2), les témoins existants **épinglaient le geste
destructeur comme comportement attendu** :

| fichier | témoin | assertion |
|---|---|---|
| `use-socket-cache-sync.test.tsx` | « invalidates targeted conversations when conversationIds provided » | `toHaveBeenCalledWith({ queryKey: ['conversations'] })` |
| idem | « falls back to active conversationId when conversationIds is empty » | idem |
| idem | « invalidates only the named conversations, plus the list » | idem |

Trois verrous, tous VERTS sur `main`, tous au-dessus d'un défaut vivant. Le
cycle 59 en avait retiré deux d'une autre forme ; ceux-ci sont d'une classe
différente et plus dure — ils n'étaient pas seulement non discriminants, ils
demandaient explicitement la panne.

## 3. Le correctif

Trois gestes, dont un est une suppression et un une simple documentation.

1. **Site A** — l'invalidation de préfixe remplacée par
   `refreshUnreadCountsFromServer(queryClient, targets)` : une lecture
   `GET /conversations/:id` par conversation **nommée par l'événement** et **déjà
   présente en cache**, dont seul l'`unreadCount` est réécrit, via
   `setConversationUnreadInCache` — le primitif central qui existait déjà pour ce
   compteur exact, dont c'est le **troisième** consommateur. Zéro nouveau code
   d'écriture de cache.

   La lecture d'une ligne + fusion non destructrice est le motif que ce fichier
   applique **déjà deux fois** (`handleConversationNew`, et la branche
   « conversation inconnue » de `handleNewMessage`).

2. **Site B** — invalidation **retirée**, les invalidations par FIL conservées.
   Le raisonnement de couverture est en §3.1.

3. **Site C** — conservé, commenté comme dernier recours.

Et, hors du défaut : `USER_STATUS` retiré de `CLIENT_EVENTS` (piste n°2 du
cycle 59), avec son entrée de handler-map et le type `UserStatusData` devenu mort.

### 3.1 Pourquoi la couverture est STRICTEMENT meilleure

Le raisonnement à savoir refaire, site par site.

**Site A.**
- *pastille* : lue, ligne par ligne, sur les ids que l'événement porte. Couvert,
  et c'était le SEUL besoin réel.
- *aperçu / rang / promotion en tête* : déjà écrits par `handleNewMessage` sur
  chaque message rejoué — et désormais **non écrasés**. Strictement mieux qu'avant.
- *conversation absente du cache* : aucune lecture (une ligne inexistante n'a rien
  à corriger). Le montage suivant lit le serveur en entier
  (`refetchOnMount: 'always'`), donc rien n'est perdu.
- *garde de conversation OUVERTE* : portée. Le gateway calcule la pastille pour
  TOUS les destinataires, lecteur compris ; sans clamp la relecture rallumerait
  le badge de la conversation qu'on a sous les yeux. Ce compteur a maintenant
  **trois** écrivains et les trois portent la garde — `handleUnreadUpdated`,
  `ConversationDeltaMergeOptions.openConversationId`, et celui-ci.

**Site B.** L'aperçu personnel recalculé arrive par `conversation:updated`
(§2.3), fusionné sans remplacement. Trois cas se ferment :
- *diffusion reçue* — la ligne est corrigée, mieux (prisme du lecteur) et sans
  rejeu de pages. Couvert.
- *diffusion perdue* (canal best-effort, `resolveSocketIO` absent) — l'ancienne
  invalidation aurait rattrapé. C'est la seule perte, et elle est bornée par
  `refetchOnMount: 'always'` sur la liste ; c'est exactement le compromis que le
  gateway a déjà choisi en rendant ce canal best-effort, pour ne pas faire échouer
  un masquage qui a bel et bien pris effet.
- *`invalidateQueries` marquait aussi la query INACTIVE comme périmée* — sans
  effet ici : `refetchOnMount: 'always'` relit de toute façon au montage suivant.
  Aucune couverture perdue par ce canal.

**Ce qu'aucun site ne perd** : le marquage « stale » d'une query inactive, pour
la raison ci-dessus. C'est l'argument qui a autorisé la suppression du hook au
cycle 59 (§3.1), et il tient identiquement ici.

### 3.2 Le plafond, et pourquoi il est tracé

`PENDING_UNREAD_REFRESH_LIMIT = 10`. Une vidange peut nommer autant de
conversations que la coupure en a touchées ; au-delà, N lectures d'une ligne
coûtent plus qu'elles ne rapportent sur le lien le plus contraint qui existe — un
mobile qui vient de revenir. Le dépassement est **tracé** (`console.warn`) plutôt
que silencieux : une troncature muette se lit comme « tout a été couvert ». Les
pastilles laissées de côté sont rattrapées par le
`conversation:unread-updated` suivant, et par le montage suivant.

## 4. Gates

- **Suite `use-socket-cache-sync.test.tsx`** : **75/75 verts** (73 préexistants
  + 4 livrés, dont 3 réécrits — voir §4.2).
- **Suite web COMPLÈTE** : voir §4.3.
- **`tsc --noEmit` web** : voir §4.3 — mesuré sur le MÊME arbre, `main` vs branche.
- **`packages/shared` reconstruit** : `tsc --project tsconfig.json`, sortie 0 —
  c'est le gate du retrait de `USER_STATUS` / `UserStatusData`.
- **`tsc --noEmit` gateway** : voir §4.3.
- **Parité locale** : `bun install --frozen-lockfile --ignore-scripts`,
  `prisma generate --generator client`, `packages/shared` reconstruit.

### 4.1 Preuve par mutation — les deux ROUGES, mesurés en PAGES REJOUÉES

Les témoins livrés montent la liste **RÉELLE**
(`useInfiniteConversationsQuery`) à côté de `useSocketCacheSync`, chargent
**deux pages** — pour que la frontière que le rejeu duplique existe — puis
comptent les requêtes de page. Écrits AVANT le correctif et observés rouges :

| témoin | `main` | après correctif |
|---|---|---|
| « ne rejoue pas ses pages quand la file hors-ligne est vidée » | **ROUGE** — 2 pages relues : `{limit:20,offset:0}` **et** `{limit:20,offset:20}` | **VERT** |
| « ne rejoue pas ses pages quand un message masqué revient en vue » | **ROUGE** — les mêmes 2 pages | **VERT** |
| « relit chaque conversation nommée et applique son compteur » | **ROUGE** — `apiService.get` jamais appelé (0 appel) | **VERT** |

Le ROUGE des deux premiers **est** le dommage n°3, mesuré : deux pages rejouées
sur un tri `lastMessageAt` décroissant paginé par OFFSET, c'est la ligne
dupliquée à la frontière. La mesure porte sur des **requêtes**, jamais sur des
appels à `invalidateQueries` — c'est la seule forme discriminante, et la leçon
du cycle 59 §4.2.

**Indépendance des deux correctifs.** Contrairement au cycle 59 — où corriger un
seul des deux chemins ne fermait pas la panne — les deux sites pendent ici à des
**événements distincts**, et chaque témoin n'en émet qu'un. L'indépendance est
donc structurelle, et le run ROUGE l'a montrée : les deux témoins ont échoué
**séparément**, chacun sur son propre événement.

Le quatrième témoin (« ne demande rien au réseau quand la conversation n'est pas
en cache ») passe déjà sur `main` : ce n'est pas une preuve de correction mais un
garde contre le correctif lui-même — il interdit à la nouvelle lecture de
sur-demander.

### 4.2 Trois témoins réécrits, et pourquoi ce n'est pas une perte de couverture

Les trois témoins de §2.5 assertaient
`toHaveBeenCalledWith({ queryKey: ['conversations'] })`. Chacun est devenu son
**contraire** (`not.toHaveBeenCalledWith`), au même endroit, avec la raison en
commentaire. Ce n'est pas une couverture retirée : c'est la même ligne de code
observée, dont le verdict attendu a changé — et l'invariant réel, « la liste ne
rejoue pas ses pages », vit maintenant dans les témoins de §4.1, **en termes
observables**.

Leurs assertions sur les invalidations par FIL
(`['messages','list',<id>,'infinite']`) sont conservées intactes : celles-là sont
correctes et restent le comportement voulu.

### 4.3 Relevés

| gate | relevé |
|---|---|
| suite web COMPLÈTE | **592 suites / 12 534 témoins verts**, 21 ignorés, sortie 0 |
| — dont delta vs cycle 59 | 592/12 530 → 592/12 534 : **+4**, exactement les 4 témoins livrés |
| `tsc --noEmit` web | **1235 erreurs sur `main`, 1235 sur la branche** — mesuré sur le MÊME arbre (`git stash` entre les relevés). **Zéro erreur nouvelle** |
| `tsc --noEmit` gateway | sortie 0, **aucune erreur** — c'est le gate qui prouve que le retrait de `CLIENT_EVENTS.USER_STATUS` ne casse aucun appelant |
| `packages/shared` build | `tsc --project tsconfig.json`, sortie 0 |
| ESLint (2 fichiers touchés) | **empreinte IDENTIQUE** `main` vs branche : 28 erreurs préexistantes (`no-explicit-any`), 0 avertissement, toutes sur des lignes non touchées. Comparaison par empreinte triée-dédupliquée, pas par total |
| suite gateway | voir corps du PR |

Le compte de témoins est la vérification la plus utile de la liste : **+4 pour
4 témoins livrés** prouve que les 3 témoins réécrits l'ont été *en place* (leur
verdict a changé, pas leur existence) et qu'aucune couverture n'a été retirée en
chemin.

## 5. Portée — qui était touché

Tout porteur web authentifié ayant la liste de conversations montée :

- **Site A**, à **chaque reconnexion suivant une coupure pendant laquelle des
  messages sont arrivés** — le cas le plus ordinaire de l'usage mobile. Et c'est
  le pire moment possible pour rejouer N pages d'une route lourde : le lien
  vient tout juste de revenir. Conséquences, par gravité :
  1. une ligne **dupliquée** et une ligne **perdue** dès 2 pages scrollées ;
  2. les écritures des `message:new` **rejouées juste avant** — aperçu, rang,
     promotion en tête — **écrasées** par la réponse REST en vol ;
  3. N requêtes lourdes là où une lecture d'une ligne par conversation suffit.
- **Site B**, à chaque restauration d'un message masqué depuis un autre appareil
  — rare, mais le dommage est identique et la lecture était **entièrement
  inutile**.

Et rien à l'écran ne signalait la panne : une liste qui se réordonne au retour
de réseau ressemble à une liste qui se met à jour.

## 6. Écarté délibérément

**Router Site A vers `useConversationsDeltaSync`.** La réponse évidente, et
fausse pour une raison mesurable : le watermark du delta est déduit du cache, que
`handleNewMessage` vient d'avancer au-delà du changement à rattraper (§2.2). Le
delta ne rendrait rien, et la pastille ne viendrait jamais. Écarté sur mesure,
pas sur intuition.

**Émettre `conversation:unread-updated` depuis le gateway sur la vidange de
file.** C'est la correction de la CAUSE : la pastille manque parce que la file ne
rejoue que des événements de message. Un `_drainedEmissions` qui joindrait le
compteur, ou un émetteur post-vidange, supprimerait tout besoin de lecture
cliente. C'est la bonne cible, et c'est un cycle à part entière (contrat
d'événement, calcul par curseur côté serveur, jumeaux iOS/Android) — voir piste
n°1.

**Passer `conversations.infinite()` en pagination keyset.** Inchangé depuis le
cycle 59 : cela rendrait un rejeu de pages inoffensif, donc supprimerait le
dommage n°3 à sa racine. Reste un changement de contrat de route
(`GET /conversations` pagine par OFFSET), donc un cycle entier.

**Le garde de la piste n°1 du cycle 59** (« toute query infinite paginée par
OFFSET porte les deux dérogations »). Écarté, et **cette fois pour une raison de
fond, pas de coût** : ce cycle démontre qu'il aurait été VERT au-dessus des trois
défauts. Les deux dérogations étaient déjà posées. Le garde utile n'est pas
celui-là — voir piste n°2, reformulée.

## 7. Découvert en chemin, NON traité

**Les trois miroirs de présence sont alignés.** Vérifié mécaniquement
(`getUserPresenceStatus` TS, `UserPresence.state(now:)` iOS,
`UserPresence.state(nowEpochMillis)` Android) : mêmes fenêtres 60s/3min/5min,
même garde anti-stale `isOnline` bornée à la fenêtre idle, même traitement d'un
timestamp illisible comme absent. La règle 1/3/5 tient sur les trois sites. Rien
à corriger — noté pour que le carnet ne le reprenne pas.

**Les neuf autres queries infinite restent keyset**, donc structurellement
immunes au dommage n°3 (dépouillement du cycle 59 §7.1, revérifié inchangé). Les
deux seules paginées par OFFSET sont `conversations.infinite()` et
`messages.infinite(convId)`.

**`messages.all` n'est jamais invalidé en bloc.** Vérifié : toutes les
invalidations de messages passent par `messages.infinite(<id>)`, clé COMPLÈTE, et
`messages.infinite` est l'autre query paginée par OFFSET. Le défaut de ce cycle
n'a donc pas de jumeau sur le couloir messages — la moitié qui, dans
`handlePendingMessagesDelivered`, était déjà correcte.

## 8. Pistes pour le cycle 61 — repérées, NON livrées

1. **`conversation:unread-updated` sur la vidange de file, côté gateway** (§6).
   Nouvelle, entièrement instruite ce cycle : `_drainedEventName` ne mappe que des
   événements de message, donc la pastille est la seule chose que la file ne
   rejoue pas, et c'est pourquoi le client doit encore lire le serveur. La
   corriger à la source supprime `refreshUnreadCountsFromServer` **et** son
   plafond. Jumeaux iOS/Android à vérifier (ils ont le même trou).
2. **Le garde « aucun `invalidateQueries` sur un PRÉFIXE d'une clé de query
   infinite paginée par OFFSET »** — reformulation de la piste n°1 du cycle 59,
   que ce cycle vient de démontrer insuffisante (§6). Le critère est
   mécaniquement vérifiable : deux clés concernées
   (`conversations.infinite()`, `messages.infinite(id)`), et la faute est
   l'invalidation d'un de leurs préfixes stricts (`conversations.all`,
   `messages.all`, `messages.lists()`). Après ce cycle il reste **une** occurrence
   dans tout le dépôt, celle du Site C, qui est légitime et devrait donc être
   l'unique exemption du garde — un garde à une exemption, sur un critère
   grep-able. C'est la formulation qui le rend écrivable ET utile.
3. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte, plusieurs cycles.
4. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, pas correctif.
5. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
6. **Le code mort des trois hooks de préférences React Query** (cycle 55) — intacte.
7. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, toujours bloquée sur l'absence de Xcode.
8. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte,
   cosmétique.
9. **Les DEUX sockets web sont-elles la bonne architecture ?** (cycle 58 §8-8) —
   intacte. Ce cycle ajoute l'argument le plus net à ce jour à la question
   générale dont elle relève : la classe n'est pas « deux sockets », ni même
   « deux mécanismes pour un job », c'est **« une règle écrite au bon endroit et
   démentie par le voisin »**. Ici la règle était en CAPITALES à vingt lignes du
   handler qui la violait, dans le MÊME fichier, et trois témoins verts
   demandaient la violation.
