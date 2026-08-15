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

# Cycle 31 — les écrivains ignoraient l'état TERMINAL de leur conteneur

Sonde annoncée en clôture du cycle 30. Le schéma DÉCLARE l'invariant
(`schema.prisma`, `closedAt` : « Conversation closed for all — no one can
write, messages stay readable ») ; aucun chemin d'écriture ne l'applique.

## Constat

- [x] Recensement : 0 lecture de `Conversation.isActive`/`closedAt` comme garde
- [x] Clôture IRRÉVERSIBLE (aucun écrivain ne rallume `isActive`)
- [x] La clôture ne touche PAS les `Participant` — toutes les gardes d'envoi
      lisent `Participant.isActive` (collision de noms sur deux modèles)

## Correctifs

- [x] Unité d'admission `conversationWriteAdmission` (sœur de `forwardAdmission`)
- [x] Câblée au point de convergence `MessagingService.handleMessage`
- [x] Câblée aux DEUX routes de lien de partage (qui contournent le funnel)
- [x] Placée APRÈS le dedup précoce (un rejeu ne doit pas être refusé)

## Gates

- [x] 4 RED discriminants vus rouges avant correctif
- [x] 2 non-régressions vertes d'emblée, dont le discriminant de PLACEMENT
- [x] Suite gateway complète : 721 suites / 17 663 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 31) + leçon 263

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 31 — le recensement
(0 garde sur 4 écrivains), la collision de noms `isActive` qui l'a rendu
invisible, le discriminant de placement (rejeu après clôture), et le constat
latent nº 1 VÉRIFIÉ proposé au cycle 32 : un canal d'annonces n'est un canal
d'annonces pour personne.

# Cycle 33 — le fait était dans le chiffré, la route lisait le drapeau

Sonde annoncée en clôture du cycle 32 : quelles disjonctions de validateur
n'ont pas d'implémentation derrière chaque branche ? Balayage par schéma sur
`services/gateway` + `packages/shared`.

## Constat

- [x] 3 candidats écartés, vérifiés jusqu'au site d'écriture (`anonymous.ts`,
      `translation.ts`, `posts/sounds.ts` — toutes branches servies)
- [x] Défaut : 4e branche du `.refine()` d'envoi (`encryptedContent` seul)
      consommée sous condition d'un booléen SÉPARÉ (`isEncrypted`)
- [x] Les DEUX ordres perdaient : chiffré jeté (400 « contenu vide »), ou
      message déclaré chiffré écrit EN CLAIR
- [x] 3e défaut sur le même champ : `encryptionMode` rejetait la casse que le
      client iOS émet (`"E2EE"`), et l'OpenAPI publiait `e2e` (refusé) en
      taisant `hybrid` (accepté)
- [x] Chemin socket vérifié JUSTE (lit la présence, pas un booléen) — REST seul
      divergeait

## Correctifs

- [x] La route gate sur la présence du chiffré ; le `!` disparaît
- [x] `mode` par défaut `e2ee` quand un chiffré arrive sans mode
- [x] Le schéma REFUSE `isEncrypted` sans chiffré (jamais de rétrogradation)
- [x] Casse normalisée à la frontière, jeu de valeurs FERMÉ
- [x] Description OpenAPI réalignée sur ce qui est appliqué

## Gates

- [x] 8 RED discriminants vus rouges avant correctif (5 route + 3 schéma)
- [x] 5 non-régressions vertes d'emblée
- [x] Suite gateway complète : **722 suites / 17 682 tests verts**
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 33) + leçon 267

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 33 — le tableau des
candidats écartés, la contrainte d'ORDRE des correctifs (normaliser la casse
seule aurait converti un 400 en corruption silencieuse), les deux
contournements clients qui étaient des rapports de bug non déposés, et la
question proposée au cycle 34 : quels faits ce dépôt lit-il à travers un
drapeau plutôt qu'à travers la donnée qui les porte ?

# Cycle 34 — les octets partaient, le fait qui les décrit restait

Sonde annoncée en clôture du cycle 33 : quels faits ce dépôt lit-il à travers un
drapeau plutôt qu'à travers la donnée qui les porte ?

## Constat

- [x] 5 candidats écartés, vérifiés jusqu'au site d'écriture (`isEdited`+`editedAt`
      écrits ensemble par les 4 transports ; `UpdateMessageBodySchema.isEdited`
      inerte ; `isForwarded` rattrapé ; view-once/blur d'attachment sans écrivain ;
      scan/moderation sans lecteur)
- [x] Défaut : `copyForwardedAttachments` partage `filePath` (le MÊME blob) et
      laisse derrière les 11 champs qui disent que ce blob est du chiffré
- [x] Le gateway ne déchiffre pas — le client déchiffre d'après ce que la ligne
      DÉCLARE : la copie annonçait « clair » en pointant du chiffré
- [x] Le chiffré était donc rendu TEL QUEL comme s'il était le média
- [x] `thumbHash` / `imageVariants` perdus aussi (écrivain réel : `UploadProcessor`)

## Correctifs

- [x] La copie emporte les 11 champs qui décrivent ses propres octets
- [x] `thumbHash` / `imageVariants` suivent le média dont ils dérivent
- [x] Une pièce en clair reste en clair — l'absence du fait copiée aussi fidèlement

## Gates

- [x] 5 RED discriminants vus rouges avant correctif
- [x] 2 non-régressions vertes d'emblée, dont le discriminant anti-sur-correction
- [x] Suite gateway complète : 722 suites / 17 689 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 34) + leçon 268

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 34 — le tableau des 5
candidats écartés, pourquoi le garde du cycle 93 ne couvrait pas ce cas (il lit
`Message`, jamais les pièces jointes), les 3 constats latents dont la
distribution de clés e2ee, et la question proposée au cycle 35 : où ce dépôt
duplique-t-il une ligne en la réénumérant à la main, et qu'a cessé d'emporter
chacune de ces projections ?

# Cycle 35 — la copie partait sans ce qui décrit ses propres pixels

Sonde annoncée en clôture du cycle 34 : où ce dépôt duplique-t-il une ligne en la
réénumérant à la main, et qu'a cessé d'emporter chacune de ces projections ?

## Constat

- [x] 6 candidats écartés, vérifiés jusqu'au site d'écriture (`SoundCaptureService`
      compose un modèle différent ; `buildPostReplyTo` est un aperçu NOMMÉ et
      jumelé à son select ; branche non éphémère de `repostPost` sans copie par
      conception ; `tus-handler` crée du neuf ; `reproduceEditedSubjectNotifications`
      déjà gardé par un test qui diffe la ligne)
- [x] Défaut : `repostPost`, branche éphémère — les OCTETS sont dupliqués, la
      ligne `PostMedia` écrite par-dessus n'énumérait que 8 champs sur 17
- [x] `width`/`height` perdues ⇒ `aspectRatio` nil, le repost SAUTE au chargement
- [x] `thumbHash` perdu ⇒ plus de placeholder instantané (le champ même que le
      cycle 34 venait de rétablir sur la famille message)
- [x] `alt`/`caption` perdus ⇒ **le média reposté devient muet à VoiceOver**
- [x] `language`/`transcription` perdues ⇒ **le Prisme n'a plus rien à résoudre**
- [x] `uploaderId` jamais posé ; `Post.audioDuration` laissé derrière `audioUrl`

## Correctifs

- [x] La copie emporte les 8 faits que ses pixels portent déjà + `uploaderId`
- [x] `audioDuration` suit `audioUrl` sur la ligne `Post`
- [x] `variantOf` et `translations` VOLONTAIREMENT hors de la copie — un pointeur
      et des URL de blobs non dupliqués ne sont pas des faits sur ces octets
- [x] L'absence copiée aussi fidèlement que la présence

## Gates

- [x] 7 RED discriminants vus rouges avant correctif
- [x] 4 non-régressions vertes d'emblée
- [x] Suite gateway complète : **723 suites / 17 700 tests verts**
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 35) + leçon 269

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 35 — le tableau des 6
candidats écartés, le tableau des 3 tests verts qui comptaient les appels sans
jamais lire la ligne écrite, les 3 constats latents dont les blobs TTS qu'aucun
balayage ne récupère, et la question proposée au cycle 36 : quelles duplications
mériteraient une garde d'exhaustivité, et laquelle des trois formes convient à
chacune ?
