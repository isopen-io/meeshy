# Audit sync temps réel — cycle 63 (2026-08-17)

Branche : `claude/keen-hamilton-ndx3vw` — repartie de `origin/main` (784f3c16,
cycle 62 bis intégralement mergé).

Piste n°1 du carnet du cycle 62, livrée — et le prix qu'elle portait était
FAUX. C'est l'essentiel de ce cycle : la piste n'attendait pas un correctif,
elle attendait une MESURE.

## 1. Le défaut

**`broadcastReadStatus` — le quatrième et dernier émetteur de
`conversation:unread-updated` — effaçait le pont ✦ à chaque accusé de lecture,
y compris quand la lecture laissait des messages derrière elle.**

Le mécanisme est celui que le cycle 62 a établi et qui vaut pour les quatre
sites : les deux clients recopient `bridge` INCONDITIONNELLEMENT, `undefined` /
`nil` compris (`ConversationSyncEngine.handleUnreadUpdated` côté iOS,
`setConversationUnreadInCache(…, { bridge: data.bridge })` côté web). Une forme
courte n'est donc pas un silence : c'est un ordre d'effacement.

Sur ce site-là, l'ordre était injustifié dans un cas précis et fréquent. Le
curseur de lecture n'avance que sur le **préfixe contigu** déjà lu (design
lecture-exacte §3) : une lecture partielle laisse donc le compteur au-dessus de
zéro. L'événement annonçait alors, dans le même payload, « il te reste 3
messages » **et** « il n'y a aucun repère pour te dire lesquels » — sur TOUS les
appareils du lecteur, le sien compris.

Rien ne le remettait ensuite : la liste web tourne en `staleTime: Infinity`, et
le seul émetteur qui reconstruisait le pont à ce moment-là était le fan-out
d'ENVOI. Il fallait qu'un nouveau message arrive dans cette conversation précise
pour retrouver son repère.

## 2. Le prix consigné était surcompté — deux fois

Le carnet du cycle 62 rangeait ce site en **arbitrage de coût**, non en oubli :

> « le corriger coûterait les 5 requêtes de la passe **à chaque accusé de
> lecture**, sur l'un des chemins les plus chauds du service. Le prix est
> disproportionné au regard du symptôme. »

La phrase pose le prix comme un fait. Mesuré, il ne l'est pas.

**Premièrement, « à chaque accusé de lecture » est faux.** Le gate à zéro
non-lu — celui que les deux émetteurs frères portent déjà, et que le contrat
gelé §3.2 impose (un compteur nul n'a pas de pont) — range le cas **dominant**
du côté gratuit : lire une conversation la vide, le compteur retombe à 0, la
passe n'est pas appelée, et l'effacement client y est **correct**. Seule la
lecture partielle paie.

**Deuxièmement, « 5 requêtes » est faux aussi.** La passe en paie **quatre** ici,
parce que la cinquième est déjà payée : `broadcastReadStatus` lit le curseur du
lecteur pour calculer le compteur qu'il émet, et c'est exactement le curseur que
la passe irait relire. Il lui est passé (`cursorsByParticipant`, le paramètre
que R6-6 avait ouvert pour `GET /conversations`).

Cette seconde économie a un effet second qui vaut plus que la requête épargnée :
le pont et le compteur du même événement sont désormais calculés sur le **même
instantané de curseur**. Les relire séparément laissait une fenêtre pour une
écriture concurrente entre les deux — un pont construit sur un curseur plus
récent que le compteur qu'il accompagne.

Le reste de l'arbitrage tient donc, et il penche dans l'autre sens : un chemin
dont le cas dominant est gratuit et le cas rare à quatre requêtes n'est pas
« disproportionné au regard du symptôme », le symptôme étant une perte de donnée
sur tous les appareils du lecteur.

### 2 bis. La leçon de méthode

Le carnet portait un chiffre non mesuré et l'a fait vivre un cycle. Ce n'était
pas une erreur de raisonnement — 5 EST le coût nominal de la passe — mais une
erreur de **portée** : le coût nominal d'une passe n'est pas le coût de son
appel sur un chemin donné, parce que les gardes du site d'appel en font partie.

> **Un prix consigné dans le carnet sans témoin qui le compte est une
> hypothèse, pas une donnée.** Le cycle qui la reprend doit la mesurer avant de
> la trancher — surtout quand elle a servi à NE PAS livrer.

## 3. Ce qui est livré

`broadcastReadStatus` accepte un `bridgeService` optionnel (interface
STRUCTURELLE `ReadStatusBridgeBuilder`, comme `UnreadBridgeBuilder` chez le
fan-out) et attache le pont au badge qu'il renvoie aux appareils du lecteur.

Quatre gardes, écrites comme telles :

| garde | ce qu'elle tient |
|---|---|
| pas de constructeur | forme courte d'avant G-123 — les six sites d'appel sont câblés, mais l'unité reste utilisable sans |
| `type !== 'read'` | un `received` n'avance aucun curseur : aucun badge, donc aucune passe |
| compteur à **zéro** | le cas dominant, gratuit — et l'effacement y reste correct |
| passe en échec | le compteur part seul (posture des trois émetteurs frères) |

Et deux choix d'identité, qui sont les mêmes que partout ailleurs sur ce chemin :

- le pont est construit pour **`personalRoomKey`** — l'identité par laquelle le
  lecteur est ADRESSÉ (`userId ?? participantId`), pas `args.userId`. Un pont
  construit pour une identité et livré dans la room d'une autre nommerait des
  auteurs que le mauvais lecteur a le droit de voir ; un témoin le gèle avec un
  `userId` délibérément DIFFÉRENT du `Participant.id` ;
- la passe part sur les **DEUX branches** de la préférence d'accusés. La
  propriété 1 de cette unité — « la préférence décide de la DIFFUSION, jamais de
  la LECTURE » — vaut pour le pont exactement comme pour le badge qu'il
  qualifie : la resynchro d'un lecteur avec ses propres appareils n'est pas une
  divulgation.

Aucun `agent` (G-127) : l'interface structurelle ne l'expose pas, donc ce chemin
ne PEUT pas le payer.

### 3 bis. La passe est LANCÉE avant d'être attendue

Les trois portes REST **attendent** `broadcastReadStatus` avant de répondre : une
passe démarrée au moment d'émettre aurait ajouté ses quatre requêtes en SÉRIE
derrière l'éventail des pairs, sur la latence de la réponse au marquage. Elle est
donc lancée dès que le compteur est connu, et attendue seulement à l'émission —
elle recouvre alors les deux lectures de l'éventail (résumé + participants). Sur
la branche où l'accusé part, le pont ne coûte **aucun temps d'attente
supplémentaire**.

Le `.catch` au site de lancement est la garde disjointe qu'impose le § *Critical
Gotchas* (`void p`) : la promesse peut n'être jamais attendue (aucun `read`), et
un rejet sans écouteur tue le process sous Node 22. Que le callee avale déjà ses
erreurs est une propriété du collaborateur, pas une garantie du site d'appel.

Le témoin qui le garde tombe par **TIMEOUT** sous la mutation « rendre les deux
sérielles » : le double du résumé ne se résout que lorsque la passe de pont a été
appelée, donc en série personne ne débloque personne.

**Aucun changement client.** Les deux plateformes lisent déjà `bridge` sur cet
événement. Le web est même déjà correct dans le détail qui compte : sa garde de
conversation OUVERTE ne clampe que le COMPTEUR, le pont est écrit sans condition,
et le rang ne le rend jamais sans non-lus (`LentilleRow.hasBridge`). Une lecture
partielle dans la conversation active écrit donc un pont juste, invisible tant
qu'on y est, exact dès qu'on en sort.

## 4. Témoins — 13 de comportement, 3 de coût

`src/socketio/__tests__/broadcastReadStatus.test.ts` (nouveau — cette unité
n'avait aucun témoin en propre, seulement des témoins de ROUTE qui la
traversaient) et `src/__tests__/unit/socketio/broadcastReadStatus.cost.test.ts`,
jumeau de `emitUnreadCountsToRecipients.cost.test.ts` : vrais services
(`MessageReadStatusService`, `ConversationBridgeService`) sur un double Prisma
qui compte ses appels.

**RED d'abord** : 7 échecs sur 12 au premier lancer. Les 5 verts décrivent la
forme courte là où elle reste correcte — même profil que le cycle 62.

Le ROUGE prouvé témoin par témoin, chaque mutation appliquée puis retirée :

| mutation | témoins tombés |
|---|---|
| `cursorsByParticipant` retiré de l'appel | les 2 témoins de réutilisation du curseur **+ le témoin de coût « QUATRE requêtes, pas cinq »** |
| gate `unreadCount <= 0` retiré | « does not call the bridge pass AT ALL… » |
| `viewerId: personalRoomKey` → `args.userId` | « builds the bridge for the identity it ADDRESSES » |
| passe conditionnée à `shouldShowReadReceipts` | « attaches the bridge even when read receipts are SILENCED » |
| `try/catch` de la passe retiré | « still emits the count when the bridge pass throws » |
| passe démarrée au moment d'émettre (sérielle) | « runs the bridge pass ALONGSIDE the peer fan-out reads » — par TIMEOUT |

Aucune mutation n'a fait tomber un témoin qu'elle ne visait pas.

### 4 bis. Un témoin de coût qui NE tombe pas — et pourquoi c'est consigné

La mutation « gate `unreadCount <= 0` retiré » ne fait PAS rougir le témoin de
coût « ne paie aucune requête quand la lecture a tout consommé ». Mesuré, pas
supposé : la gratuité y tient par **deux gardes indépendantes** — celle du site
d'appel, et le premier étage de `buildBridgeData`, qui écarte un candidat à zéro
avant toute requête.

Le témoin de coût reste juste (le prix EST nul) mais il ne garde pas l'intention
du site d'appel ; c'est le témoin de comportement qui la garde. Les deux sont
complémentaires — le PRIX d'un côté, l'INTENTION de l'autre — et c'est écrit
dans le fichier plutôt que laissé à découvrir sous la prochaine mutation.

## 5. Le tableau des quatre émetteurs, clos

| Émetteur | Pont ? | Depuis |
|----------|--------|--------|
| `emitUnreadCountsToRecipients` (fan-out d'envoi) | ✅ | G-123, corrigé REV-5/B2 |
| `MeeshySocketIOManager._emitUnreadCountsSnapshot` (reconnexion) | ✅ | cycle 62, borné à une page de liste |
| `broadcastReadStatus` (resynchro du lecteur) | ✅ | **ce cycle** |
| `ConversationHandler` (sur `conversation:join`) | ❌ | **légitime** — on rejoint pour LIRE, l'ouverture consomme le pont |

Le dernier reste volontairement muet, et le cycle 62 en a instruit la raison :
le client clampe le compteur à 0 pour la conversation active, le rang ne rend
jamais un pont sans non-lus, et le web ne rejoint qu'UNE conversation à la
reconnexion — le sinistre de masse n'existe pas sur ce chemin.

**Conséquence pour la piste « manque de vocabulaire » du carnet du cycle 62**
(le contrat n'a aucune valeur pour dire « je n'ai pas calculé », deux états sur
le fil pour trois sur le fond) : elle perd son urgence. Elle était motivée par
des émetteurs qui devaient se taire faute de pouvoir payer ; il n'en reste
aucun. Le seul silence restant est un silence VRAI — « il n'y a pas de pont » —,
et c'est précisément ce que la forme courte exprime déjà correctement. La piste
reste ouverte comme question de contrat, elle n'est plus une dette de défaut.

## 6. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| `broadcastReadStatus.test.ts` | ✅ 13/13 |
| `broadcastReadStatus.cost.test.ts` | ✅ 3/3 |
| Suite gateway complète | **744/744 suites, 18 044 témoins** verts (une suite rendue verte, § 6 bis) |
| Clients | aucun changement — les deux lisent déjà `bridge` |

### 6 bis. La seule suite touchée — et ce qu'elle révèle du double, pas du code

`messages-extended.test.ts` a rougi sur un témoin d'ADRESSAGE (« adresse un
participant sans compte par son participant id »), et le défaut accusé n'existait
pas. Son double posait `participant.findMany.mockResolvedValueOnce([…])` :
un `Once` sert la première lecture **ARRIVÉE**, pas la lecture visée. La route
en fait désormais deux — l'éventail des accusés (`{conversationId, isActive}`) et
la résolution du lecteur par la passe de pont (`OR: [{id}, {userId}]`) — et la
passe partant en parallèle (§3 bis), c'est elle qui consommait la valeur. Le
fan-out retombait sur le défaut du double, qui ne porte qu'un participant à
compte.

Le double regarde maintenant sa CLAUSE et sert chaque appelant selon ce qu'il
demande. Vérifié après réparation : le témoin retombe bien sous la mutation qu'il
nomme (éventail filtré sur `userId`), donc il n'a pas été affaibli pour passer.

> **Un `mockResolvedValueOnce` encode un ORDRE D'APPEL, pas une lecture.** Il
> survit tant qu'un seul appelant existe, et se met à décrire un autre programme
> le jour où un second apparaît — a fortiori concurrent. Un double qui branche
> sur sa clause n'a pas ce défaut.

## 7. Pistes pour le cycle 64

1. **Le vocabulaire du contrat gelé** (cycle 62 §7-1, requalifiée ci-dessus) —
   plus une dette de défaut, une question de contrat. À rouvrir si un cinquième
   émetteur apparaît qui ne puisse pas payer.
2. **Le flake non identifié de `packages/shared`** (cycle 61 bis §7) — intacte.
   Le prochain run de CI rouge doit le NOMMER (`--reporter=json --outputFile`).
3. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte.
4. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte.
5. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, intacte.
6. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
7. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
8. **Le coût des autres pistes du carnet, non mesuré.** Nouvelle, et c'est la
   généralisation du §2 bis : au moins deux pistes restantes sont motivées par
   un prix supposé (la pagination keyset, la file par appareil). Avant de les
   trancher, les mesurer — un témoin de compteurs coûte une heure et vaut mieux
   qu'un cycle d'hypothèse.
