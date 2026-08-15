# Cycle 25 — la file de rejeu hors ligne n'avait de borne que du côté qui ne sert jamais

Routine « amélioration continue temps réel ». Les cycles 21–23 avaient pris la
FORME et l'AUDIENCE des événements ; le cycle 24 a changé de question pour
**en fonction de quoi le coût grandit**, et l'a trouvée dans la présence. Ce
cycle garde la question du coût et change de FAMILLE : le complément de la
diffusion vivante — la **file de rejeu hors ligne**.

## Constat

**D1 — `RedisDeliveryQueue` n'avait de plafond que sur sa tranche mémoire.**

La tranche mémoire (repli d'urgence quand Redis est injoignable) est plafonnée
depuis toujours : 1000 users, 50 entrées chacun, avec une éviction qui prend
soin de trancher par `enqueuedAt` et non par emplacement. Sa jumelle Redis —
celle qui porte en réalité tous les arriérés, jusqu'à 48 h — n'avait aucune
borne : un `RPUSH` par événement, aucun `LTRIM`.

Trois coûts grandissaient donc avec l'arriéré d'un seul absent :

1. **La mise en file elle-même.** `ENQUEUE_DEDUP_LUA` lit la liste ENTIÈRE et
   `cjson.decode` chaque entrée à chaque appel, **atomiquement dans le thread
   unique de Redis**. Le coût d'un événement de plus pour un absent était payé
   par tous les autres clients de ce Redis ; remplir une file de N coûte O(N²)
   décodages de Redis bloqué. Même forme que le cycle 24, sur une ressource pire.
2. **La rafale de rejeu** — `_drainPendingMessages` émet chaque entrée, une par
   une, à la reconnexion.
3. **La mémoire Redis**, retenue 48 h.

**Pourquoi ça a survécu** : les deux tranches sont deux moitiés du MÊME fichier,
décrites par des commentaires voisins et cohérents. La seule propriété qui les
distinguait — l'existence d'une borne — n'était énoncée nulle part.

## Correctifs

- [x] `DELIVERY_QUEUE_MAX_PER_USER = 500` (`packages/shared/types/delivery-queue.ts`),
      documentant les trois coûts qu'il borne d'un coup
- [x] `LTRIM KEYS[1], -tonumber(ARGV[5]), -1` après chaque `RPUSH` — conserve les
      N arrivées les plus RÉCENTES
- [x] Remplacement d'une entrée mutable : `LREM` + `RPUSH` en QUEUE au lieu de
      `LSET` sur place — c'est ce qui rend l'éviction par emplacement correcte
      (une entrée remplacée sur place porte l'horodatage le plus récent à
      l'emplacement le plus ancien : un `LTRIM` aurait évincé l'édition la plus
      fraîche)
- [x] Les deux plafonds restent de tailles différentes, et le fichier dit
      pourquoi : tas de la passerelle vs CPU/mémoire Redis + rafale de reconnexion
- [x] Aucun changement client — forme et ordre des événements rejoués inchangés

## Gates

- [x] 3 RED discriminants vus rouges avant correctif (vérifié en restaurant le
      Lua d'origine, puis restauré)
- [x] `RedisDeliveryQueue.test.ts` : 90 verts (86 pré-existants + 4 témoins)
- [x] Suite gateway complète : 719 suites / 17601 tests verts
- [x] Suite `packages/shared` : 54 fichiers / 1542 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 25)

## Limite énoncée

Aucun double Redis Lua-capable dans le dépôt : la tranche Redis n'est
vérifiable que par contrat (arguments reçus par le script, texte du script).
C'est dit en tête du `describe` et dans le journal, avec la suite à mener
(ioredis-mock avec `eval`, ou un Redis en CI).

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 25 — les quatre balayages
(dont deux neufs : `SERVER_EVENTS` × écouteurs clients, lockstep du `_seq`), le
défaut, le correctif en deux temps, et les quatre surfaces vérifiées correctes
à ne pas re-instruire.
Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 24 — les quatre sondes
(dont deux neuves : contrat d'ACK, `CLIENT_EVENTS` × écouteurs gateway), le
défaut, le correctif, et les quatre surfaces vérifiées correctes à ne pas
re-instruire.

# Cycle 26 — le client choisissait l'adresse de la diffusion

Routine « amélioration continue temps réel ». Les cycles 21–24 ont pris
`message:translation`, `conversation:updated` et `user:status`. Ce cycle change
de famille (les réactions sociales) et de QUESTION : non plus « qui reçoit /
quelle forme / combien ça coûte », mais **d'où vient l'ADRESSE d'une diffusion**.

## Constat

**D1 — `comment:reaction-*` diffusait vers le `postId` du payload CLIENT.**

Le handler tient déjà la vérité (`loadCommentPostAcl` lui rend le post du
commentaire, pour son verdict d'audience) et la jetait. Conséquences : sur un
repost simple l'événement partait vers une room vide (les lecteurs sont dans
celle de la racine, où le commentaire vit aussi) — silencieux, ACK `success` ;
et un `postId` arbitraire injectait l'agrégation d'un commentaire dans le cache
d'un post étranger.

Survécu parce que `PostReactionHandler` implémente la MÊME règle correctement
(`targetPostId`) : les deux copies coïncident en nominal et ne diffèrent que là
où aucun test ne regardait. Un mock incohérent figeait même le défaut.

**D2 — les deux `handleRequestSync` n'avaient aucune garde d'audience.**

La garde de la room ne bornait rien : au lieu de s'abonner, il suffisait de
demander l'état. Le versant commentaire rend les `userIds` de chaque réacteur —
roster nominatif d'un commentaire sur un post `PRIVATE`, à partir du seul
`commentId`.

## Correctifs

- [x] `CommentReactionHandler` — room, payload et notification portent
      `thread.postId` (déjà chargé, zéro requête ajoutée), add ET remove
- [x] `POST /posts/:postId/comments/:commentId/like` — jumeau REST du même
      défaut : diffusion + typage de notification depuis `thread.postId`
- [x] `CommentReactionHandler.handleRequestSync` — garde `canUserConsumePost`
- [x] `PostReactionHandler.handleRequestSync` — garde `resolveConsumptionTarget`
      (audience + redirection repost), refus indistinct
- [x] Mock d'ACL du doublon de test aligné sur un monde possible

## Gates

- [x] 12 RED discriminants vus rouges avant correctif (6 D1 + 2 D1 bis + 4 D2)
- [x] 4 suites de réactions : 140 verts
- [x] Suite gateway complète : 719 suites / 17614 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 26) + leçon 258

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 26 — la sonde neuve
(« autorité de l'entrée »), la matrice handlers × adresse, les deux défauts, et
les quatre surfaces vérifiées correctes à ne pas re-instruire.

# Cycle 28 — l'entrée du client fixait l'AUDIENCE, pas seulement l'adresse

Routine « amélioration continue temps réel ». Ce cycle ne cherche pas un
nouveau site : il **prend le candidat que le cycle 26 avait consigné avec sa
preuve**, délibérément laissé de côté parce qu'il demandait trois décisions
plutôt qu'un renommage.

## Constat

`DELETE /posts/:postId/comments/:commentId` supprime par `commentId` (la garde
de propriété est juste) puis relisait un post par le `:postId` du CHEMIN, dont
il tirait trois décisions : la clé de cache client du payload, le
`commentCount` annoncé, et `authorId`/`visibility`/`visibilityUserIds` — **la
liste de diffusion elle-même**. Un cran au-delà du D1 du cycle 26 : l'appelant
choisissait non plus seulement *où*, mais *à qui*.

Cas non-malveillant, le repost simple : les commentaires vivent sur la RACINE,
les lecteurs sont dans `post:<racine>`, l'annonce partait vers `post:<repost>`
— room vide. Aucun refetch ne rattrape (`getComments` filtre `parentId: null`).

## Correctifs

- [x] `PostCommentService.deleteComment` rend `postId` (déjà chargé — 0 requête)
- [x] Route : adresse, ACL, compteur et audience dérivés du résultat ; le
      `:postId` du chemin n'est plus lu
- [x] `onDuplicate` relit la ligne soft-supprimée (le soft-delete ne l'efface
      pas) pour que le rejeu ait la même adresse serveur
- [x] Adresse indérivable ⇒ aucune diffusion (repli explicite, jamais `undefined`)
- [x] Doubles de test réalignés sur un monde possible (le mock figeait le défaut)

## Gates

- [x] 6 RED discriminants vus rouges avant correctif
- [x] Suites voisines : 21 suites / 793 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte
- [x] CHANGELOG + journal d'audit (§ Cycle 27) + leçon 259

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 28 — les trois décisions
tranchées, la matrice des SIX chemins du fil (un seul divergeait, la famille est
close), et la question neuve proposée au cycle 29 : le MOMENT de la diffusion
par rapport à la durabilité du fait.
