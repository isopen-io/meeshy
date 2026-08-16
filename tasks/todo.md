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

# Cycle 38 — une variable servait deux identités qui divergent chez l'invité

Piste annoncée en clôture du cycle 37 : les deux usages de `args.userId` dans
`broadcastReadStatusUpdate` veulent des choses OPPOSÉES, et c'est ce conflit —
pas le renommage d'un paramètre — qui est le sujet.

## Constat

- [x] Le conflit nommé : `payload.userId` veut le `User.id` de l'acteur
      (`null` s'il n'en a pas) ; `ROOMS.user(...)` veut la clé de room
      (`userId ?? Participant.id`). Les deux coïncident pour un acteur AVEC
      compte, divergent pour un invité de lien
- [x] Le contrat était déjà tranché aux trois bouts (`packages/shared`, iOS,
      Android) : `userId` nullable, cas anonyme NOMMÉ
- [x] Divergence réelle constatée : les 3 émetteurs SOCKET du même événement
      nommaient déjà l'invité `null` — dont `ConversationHandler._resyncReadStatusToSocket`,
      qui prend un `registeredUserId` DISTINCT de `participantRowId` ; les 5
      routes REST le nommaient `Participant.id`
- [x] Le même invité, même conversation, annoncé de deux façons selon le transport
- [x] 3 consommateurs iOS + web + Android vérifiés AVANT de nuller le champ :
      aucun ne change de comportement (2 gardes iOS calculent déjà
      `userId ?? participantId` ; la 3e ne s'applique pas à une session anonyme ;
      web et Android ne lisent pas le champ)
- [x] `routes/messages.ts` écarté et vérifié (`allowAnonymous: false`)

## Correctifs

- [x] Les deux rôles dérivés séparément dans les 5 routes :
      `actorUserId = isAnonymous ? null : userId` / `personalRoomKey = actorUserId ?? participantId`
- [x] `userId: string` → `actorUserId: string | null` : le type interdit
      désormais la recopie de `authContext.userId`
- [x] Éventail inchangé au bit près — mêmes rooms, mêmes destinataires
- [x] `services/gateway/CLAUDE.md` : la ligne « user.id or sessionToken » était
      fausse sur les deux moitiés, remplacée par les deux valeurs + les deux
      dérivations

## Gates

- [x] 5 RED discriminants vus rouges avant correctif
- [x] 11 non-régressions vertes d'emblée, dont 2 gardes anti-sur-correction
      (`user:null` interdit ; l'éventail atteint toujours les deux pairs)
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : voir § Validation
- [x] CHANGELOG + journal d'audit (cycle38.md) + leçon 272

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle38.md` — le tableau des deux
rôles, le tableau des 6 émetteurs (3 d'un avis, 3 de l'autre), la vérification
des consommateurs sur les 3 plateformes, le piège de sur-correction
(`ROOMS.user(null)` collerait le badge de tous les invités), et la piste du
cycle 39 : elle porte sur **iOS**, pas sur le gateway — donner au SDK une
identité d'acteur courant qui couvre la session anonyme
(`AuthManager.currentUser` reste nil pour un invité), puis aligner les 3 gardes
dessus.

# Cycle 39 — le doublon, et le bout qu'il a rendu visible

## Constat

- [x] La piste du cycle 37 a été instruite **deux fois en parallèle** par deux
      sessions de la même routine, sans coordination possible
- [x] La PR #3052 (session A) a mergé à 21:06 ; ce cycle a ouvert sa PR une heure
      trop tard, sur un défaut déjà réparé — même diagnostic, mêmes 5 RED, même
      nom de fichier d'audit
- [x] Le correctif de ce cycle a donc été **jeté**, pas redéposé

## Le bout resté ouvert (livré)

- [x] En rendant `payload.userId` légitimement `null` pour un invité, #3052 a
      rendu inapplicable pour cette population le seul contrat qui disait comment
      revendiquer `lastReadAt`/`unreadCount`
- [x] L'identité qui convient voyage DÉJÀ dans le payload : `participantId`
- [x] L'acteur se reconnaît par `userId ?? participantId` — la même règle que
      celle qui nomme sa room personnelle
- [x] Contrat partagé + miroir iOS + KDoc Android (absent jusqu'ici) + README
      socketio § seconde moitié de la règle
- [x] Zéro changement de code d'exécution, zéro migration client

## Écarté délibérément

- [x] `resolveBroadcastActor` — construit, testé, puis retiré : le type
      `actorUserId: string | null` de #3052 ferme déjà le trou que l'unité aurait
      fermé (leçon 273)

## Gates

- [x] Aucun fichier `.ts` d'exécution touché
- [x] `tsc --noEmit` gateway : 0
- [x] Suite gateway complète sur la base à jour : 724 suites / 17 732 tests verts (inchangé)
- [x] CHANGELOG + journal d'audit (cycle 39) + leçon 273

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle39.md` — le tableau de la
collision entre les deux sessions, pourquoi le doublon n'était pas stérile, et
l'enseignement de coordination : relire `main` sur les FICHIERS visés avant
d'ouvrir la PR, pas seulement au démarrage.

# Cycle 40 — la règle du masquage personnel avait trois consommateurs et zéro déclencheur

Routine « amélioration continue temps réel ». Le cycle 38 a fait dire la vérité
au champ `userId` de `read-status:updated` et a désigné iOS comme suite ; le
cycle 39, mené EN PARALLÈLE par une autre session, a tranché le contrat de
reconnaissance de l'acteur (PR #3056). Cet
environnement est Linux **sans toolchain Swift** (borne déjà énoncée au cycle
36) : la piste iOS reste ouverte, ce cycle prend une famille testable ici et
rapporte les constats iOS mesurés au passage.

## Constat

**D1 — masquer le dernier message ne rafraîchissait pas la ligne de liste.**

Le masquage personnel est appliqué sur TOUTES les surfaces de lecture
(`resolveVisibleLastMessages`, `personalHistoryFilter`,
`resolvePersonalPreviewOverrides`). La dernière — la moitié TEMPS RÉEL, installée
pour qu'un lecteur ne se voie pas repousser dans sa ligne de liste ce qu'il vient
d'en retirer — n'a jamais eu pour appelant le geste qui CRÉE le masquage. Ses
trois déclencheurs sont l'édition, la suppression pour tous, la traduction qui
atterrit.

Conséquence : la bulle disparaît du fil (`message:hidden-for-me`), la ligne de
liste garde l'aperçu masqué jusqu'à une mutation sans rapport — indéfiniment si
rien d'autre ne bouge. Et le client ne peut pas s'en tirer seul : le remplaçant
est le dernier message encore visible POUR CE LECTEUR, que seul le serveur sait
rendre.

Quatre écrivains concernés : `delete-for-me` (unitaire, lot), `restore-for-me`,
`clear-history`.

## Correctifs

- [x] `PreviewUpdateScope.onlyForReaderUserId` — troisième borne du fan-out
      (après l'INSTANT et la LANGUE : l'AUDIENCE), posée AVANT la sonde de
      masquage et avant la boucle, parce qu'elle borne les deux
- [x] `services/messaging/personalPreviewRefresh.ts` — déclencheur unique,
      coalesce par conversation (un lot va jusqu'à 100 ids, plusieurs
      conversations, une ligne se recalcule une fois)
- [x] Câblé aux quatre écrivains ; l'en-tête de `personalMessageVisibilitySync`
      passe de trois obligations à quatre
- [x] Posture best-effort inchangée : un recalcul impossible ne fait pas échouer
      un masquage qui a pris effet
- [x] Deux harnais de test complétés (prisma double muet ⇒ témoin vert sur une
      version qui n'appelle rien)
- [x] Aucun changement de contrat, aucun changement client

## Gates

- [x] 11 RED discriminants vus rouges avant correctif (3 borne d'audience,
      4 contrat de service, 4 câblage des routes), puis restaurés
- [x] 5 non-régressions vertes d'emblée, dont les gardes anti-sur-correction
- [x] `tsc --noEmit` gateway : 13 erreurs pré-existantes, identiques avec et
      sans ce diff (mesuré par `git stash`)
- [x] Suite gateway complète : **724 suites / 17748 tests verts** (321 s)
- [x] CHANGELOG + journal d'audit (cycle40)

## Limite énoncée

Effectif sur **web** ; **inerte sur iOS**, où `ConversationStore.merging` jette
tout groupe d'aperçu dont le `lastMessageAt` recule. Ce trou pré-existe ce cycle
(il vaut déjà pour la suppression POUR TOUS du dernier message) et se corrige
côté client, avec un discriminant « périmé » vs « recalculé ». Détail et pistes :
`tasks/realtime-sync-audit-2026-08-15-cycle40.md` § Constats iOS.

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle40.md` — le constat, les quatre
écrivains, le correctif en deux pièces, les deux constats iOS mesurés et non
livrés, et les trois surfaces balayées trouvées correctes à ne pas ré-instruire.

# Cycle 41 — la règle était écrite, et appliquée à une seule des deux branches

Piste ouverte au cycle 38, reconduite au cycle 39, instruite ici.

## Constat

- [x] `lastReadAt`/`unreadCount` décrivent l'ACTEUR (sa frontière de lecture,
      son arriéré sur ce fil), pas la conversation — et partaient dans
      l'ÉVENTAIL sur un `type: 'read'`
- [x] Chaque pair recevait donc l'arriéré de lecture de celui qui venait de lire
- [x] Le raisonnement qui l'interdit était DÉJÀ écrit 15 lignes plus haut, sur
      la branche `received` : « would needlessly disclose the actor's backlog to
      every peer in the room »
- [x] Second angle, le consentement : `shouldShowReadReceipts` consent à « j'ai
      lu ton message », pas à publier un arriéré — l'utilisateur qui ACTIVAIT
      ses accusés était celui qui divulguait le plus
- [x] 2 sites atteints (`message-read-status.ts`, `conversations/messages.ts`) ;
      les 4 autres émetteurs de l'événement vérifiés indemnes, avec la raison

## Correctifs

- [x] Deux payloads pour deux audiences : l'éventail perd les deux champs, la
      version complète part dans `ROOMS.user(userId ?? participantId)`
- [x] `exceptRoom` ajouté à `emitToConversationParticipants` — retirer la room
      personnelle ne suffit pas, la room de conversation tient l'acteur dès
      qu'il a le fil ouvert
- [x] Exclusion conditionnée à la présence des champs : sur un `received` elle
      coûterait l'événement à l'acteur sans rien protéger
- [x] Invariant vérifié aux deux bouts d'`AuthHandler` : toute session rejoint
      sa room personnelle AVANT toute room de conversation
- [x] 3 consommateurs relus DANS LE CODE avant de restreindre le payload —
      aucun ne change de comportement

## Gates

- [x] 6 RED discriminants vus rouges (4 site 1, 2 site 2)
- [x] 3 non-régressions vertes d'emblée, dont 2 gardes anti-sur-correction
- [x] 1 double `io` préexistant complété (`except` manquait), pas un correctif régressant
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : voir § Validation de l'audit
- [x] CHANGELOG + journal d'audit (cycle40) + leçon 275 + contrat partagé +
      miroirs iOS/SDK/Android + README socketio

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle41.md` — le tableau des 6
émetteurs, celui des 3 consommateurs, pourquoi `exceptRoom` n'est pas décoratif,
les deux options écartées (porter les champs par `conversation:unread-updated` ;
retirer la room de conversation de l'éventail), et la piste du cycle 42 :
`routes/messages.ts` émet un `read` qui ne synchronise AUCUN appareil de
l'acteur — le symétrique de cette fuite, pas une fuite.

# Cycle 42 — la préférence tenait à trois portes sur quatre

Piste ouverte à la fin du cycle 41, instruite ici — et plus large que ce qu'elle
annonçait.

## Constat

- [x] `POST /messages/:messageId/status` est le 4e émetteur REST de
      `read-status:updated`, et le seul qui ne consulte JAMAIS
      `showReadReceipts` : un utilisateur ayant retiré ses accusés diffusait
      quand même un événement NOMINATIF à toute la conversation
- [x] `summary` retirait déjà les opt-out de ses compteurs — ce n'est pas le
      compteur qui fuyait, c'est le NOM de l'acteur
- [x] Les deux manques annoncés par la piste confirmés : ni `actorReadSync`
      (curseur multi-appareils), ni `conversation:unread-updated` (badge)
- [x] Aucun client du dépôt n'appelle cette route — balayage web / iOS /
      Android / SDK / E2E ; seuls deux fichiers de tests gateway l'exercent

## Correctifs

- [x] Une unité partagée, `socketio/broadcastReadStatus.ts`, remplace les
      QUATRE copies — écrire une 4e copie correcte aurait rejoué le mécanisme
      qui a produit le défaut
- [x] La préférence décide de la DIFFUSION, jamais de la LECTURE : le badge de
      l'acteur part sur les deux branches
- [x] Acquis des cycles 38 et 41 (deux identités, deux payloads) désormais tenus
      à un seul endroit
- [x] Préférence et arriéré lus EN PARALLÈLE — le chemin chaud perd une attente
      sérielle
- [x] Route conservée, pas retirée : aucun appelant dans le dépôt ne prouve
      aucun appelant sur le terrain

## Gates

- [x] 6 RED discriminants vus rouges, 5 non-régressions vertes d'emblée
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : 726 suites, 17 771 tests, tout vert
- [x] `broadcastReadStatus.ts` 100 % ; `message-read-status.ts` 100 % lignes
- [x] 2 doubles de test préexistants complétés (`.except` manquant ; `io` absent)
- [x] CHANGELOG + README socketio + journal d'audit + leçon 277

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle42.md` — le tableau des trois
pièces manquantes, pourquoi c'est le nom et non le compteur qui fuyait, le
raisonnement aligner-plutôt-que-retirer, les deux doubles réparés, et la piste
du cycle 43 : les deux émetteurs SOCKET du même événement ne consultent pas la
préférence non plus, mais leur fan-out est collectif — établir d'abord si un
`received` automatique relève de ce réglage.

# Cycle 43 — la piste du cycle 42 était fausse ; le sérialiseur cachait une dépense

## Constat

- [x] Piste héritée VÉRIFIÉE puis écartée : les deux émetteurs socket de
      `read-status:updated` consultent bien `showReadReceipts` — le cycle 42 se
      trompait sur les deux
- [x] Écart réel trouvé à la place, et NON livré : côté socket la préférence
      coupe le `markMessagesAsReceived` (l'ÉTAT), là où les trois portes REST
      enregistrent et ne taisent que la diffusion — l'intention n'est donc
      atteinte par personne, l'état dépend du transport
- [x] Défaut livré : trois `select` chargent `statusEntries` que
      `fast-json-stringify` retire faute d'être déclaré au schéma — chargé,
      parfois recopié, jeté
- [x] Deux des trois sites payaient la relation SANS opt-in, sur chaque page de
      messages d'un lien partagé
- [x] Aucun client du dépôt ne demande `include_status` ; le champ était pourtant
      promis jusque dans `@meeshy/shared`

## Correctifs

- [x] Trois `select` + le mapping + la recopie du formateur de lien supprimés
- [x] `include_status` conservé et ACCEPTÉ (aucun client rejeté), description
      corrigée, renvoi vers la voie gatée `GET /conversations/:id/statuses`
- [x] La raison écrite aux trois endroits où quelqu'un voudrait les rétablir —
      déclarer le champ au schéma publierait des accusés nominatifs SANS gate
- [x] Doc `@meeshy/shared` corrigée (elle promettait un champ jamais servi)

## Gates

- [x] 4 RED discriminants vus rouges avant correctif
- [x] Garde de contrat sur un VRAI Fastify — les doubles sans sérialiseur ne
      pouvaient pas voir le défaut (3e cycle consécutif sur ce motif)
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : 727 suites, 17 776 tests, tout vert
- [x] CHANGELOG + journal d'audit (cycle43) + leçon 278

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle43.md` — pourquoi la piste
héritée ne tenait pas, le tableau des trois sites (opt-in / recopié / servi), le
piège qui survit au correctif, les trois options écartées, et la piste du
cycle 44 : établir si `showReadReceipts` gouverne les `received` avant de
retourner le gate d'écriture des deux émetteurs socket.

# Cycle 45 — la question ouverte depuis le cycle 43 avait sa réponse écrite dans le dépôt

## Constat

- [x] Question héritée TRANCHÉE : `showReadReceipts` gouverne la DIVULGATION,
      pas l'enregistrement — la règle est écrite deux fois dans le dépôt
      (doc de `broadcastReadStatus`, doc de `POST …/delivery-receipt`)
- [x] Défaut livré : les deux émetteurs SOCKET gataient l'ÉCRITURE
      (`autoDeliverToOnlineRecipients` filtrait avant `markMessagesAsReceived`,
      `_emitDeliveryForDrainedMessages` sortait sur la préférence), là où les
      trois portes REST enregistrent toujours et ne taisent que la diffusion
- [x] L'ÉTAT dépendait donc du transport, sur le chemin NOMINAL (auto-livraison)
- [x] Le gate d'écriture ne protégeait rien : `_loadReadReceiptOptOuts` retire
      l'opt-out des CINQ lecteurs de statut quoi qu'il y ait en base
- [x] Coût réel : `showReadReceipts` est RÉVERSIBLE — à la réactivation
      l'arriéré ressort « jamais livré » et les coches de l'expéditeur
      régressent de ✓✓ à ✓ sur tout l'historique

## Correctifs

- [x] Gate déplacé de l'écriture vers la diffusion, aux deux sites
- [x] `firstAcker` choisi parmi les destinataires marqués QUI PARTAGENT leurs
      accusés — le déplacement naïf aurait nommé un opt-out dans le payload
- [x] Doc des deux méthodes + `socketio/README.md` (qui déclarait l'écart
      « connu et non tranché ») alignés

## Gates

- [x] 3 RED discriminants vus rouges avant correctif
- [x] 2 gardes de non-régression vertes d'emblée (aucune diffusion quand tous
      les destinataires en ligne ont coupé, ni au drain d'un lecteur opt-out)
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte
- [x] CHANGELOG + journal d'audit (cycle45) + leçon 282

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle45.md` — les deux citations qui
tranchent la question, le tableau des cinq portes, pourquoi un gate d'écriture
qui double un gate de lecture ne fait que détruire, le piège de l'acteur nommé,
les deux options écartées, et la piste du cycle 46 : `_loadReadReceiptOptOuts`
ignore les participants sans `userId` — établir si une session anonyme peut
atteindre `PATCH /me/preferences/privacy` avant de conclure.

# Cycle 46 — l'écran Confidentialité écrivait dans un tiroir que le serveur n'ouvrait pas

## Constat

- [x] Question héritée du cycle 45 TRANCHÉE : `PATCH /me/preferences/privacy`
      est INATTEIGNABLE pour une session anonyme (`allowAnonymous: false`,
      `routes/me/preferences/index.ts`) — la piste se referme sans correctif
- [x] Défaut trouvé en l'établissant : les deux moitiés du chemin visent des
      tables DIFFÉRENTES. L'app écrit `UserPreferences.privacy` (document JSON) ;
      les six portes de diffusion lisent `UserPreference` (clé/valeur héritée)
- [x] Le seul écrivain du rangement lu, `PreferencesService.updatePrivacyPreferences`,
      n'a AUCUN appelant — fichier intégralement orphelin
- [x] Portée : `showReadReceipts`, `showOnlineStatus`, `showLastSeen`,
      `showTypingIndicator` — QUATRE préférences inertes côté serveur
- [x] Invisible par somme de trois causes : le `GET` relit le document (l'écran
      dit vrai), le défaut vaut `true` (aucun symptôme), les doubles ne
      modélisaient qu'un rangement (3e cycle consécutif sur ce motif)

## Correctifs

- [x] Résolveur unique `services/preferences/privacy-storage.ts` : document
      d'abord, lignes héritées seulement pour les utilisateurs sans document
- [x] Les DEUX lecteurs y passent — `PrivacyPreferencesService` cesse de
      réimplémenter la règle, `_loadReadReceiptOptOuts` aussi
- [x] `buildPreferences` réduit à `{ ...défauts, ...stocké }`
- [x] `PreferencesService.updatePrivacyPreferences` nommé en commentaire comme
      non branché et à ne pas rebrancher tel quel

## Gates

- [x] 6 RED discriminants vus rouges avant correctif
- [x] Gardes de non-régression dans les deux sens (document prime / lignes
      héritées servies en son absence / `{}` ne fait pas taire le repli)
- [x] Doubles corrigés pour modéliser les DEUX rangements
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte
- [x] CHANGELOG + ADR `services/gateway/decisions.md` + journal (cycle46) + leçon 283

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15-cycle46.md` — le tableau des deux
rangements, les trois causes d'invisibilité, pourquoi le repli hérité est
conservé, les trois options écartées, et les pistes du cycle 47 : supprimer le
`PreferencesService` orphelin, invalider les caches à l'écriture (un réglage met
aujourd'hui jusqu'à 5 min à prendre effet), et verrouiller `allowAnonymous: false`
par un témoin.

# Cycle 46 bis — un aperçu recalculé a le droit de reculer ; la garde iOS l'ignorait

(« bis » : une autre exécution parallèle de la routine porte déjà le numéro 46 —
même piste héritée du cycle 45, même conclusion sur elle, surfaces disjointes.
Motif de la leçon 198, reproduit ; cf. leçon 203.)

## Constat

- [x] Piste héritée du cycle 45 TRANCHÉE, sans correctif : `PATCH
      /me/preferences/privacy` est INATTEIGNABLE par une session anonyme (les
      deux routeurs montent `allowAnonymous: false`, le middleware répond 403
      avant tout handler) — le `continue` sur les participants sans `userId`
      est correct, les deux bouts s'accordent pour la bonne raison
- [x] Vérifié au passage : `READ_RECEIPT_OPT_OUT_CACHE` n'est invalidé nulle
      part en production, mais `PrivacyPreferencesService.invalidateCache` non
      plus — même TTL, même absence d'invalidation, l'alignement revendiqué est
      réel. Rien à corriger
- [x] Défaut livré : `ConversationStore.merging` tient le groupe d'aperçu pour
      monotone et jette TOUT recul — or un recalcul serveur recule
      légitimement sur DEUX chemins nominaux (suppression pour tous du dernier
      message, masquage personnel du dernier message visible)
- [x] Coût réel : la ligne de liste affichait l'aperçu d'un message qui
      n'existe plus, indéfiniment si rien d'autre ne bougeait dans la
      conversation ; et le correctif du cycle 40 restait **inerte sur iOS**
- [x] Le client ne pouvait pas s'en tirer seul : diffusion périmée et recalcul
      autoritatif sont indiscernables du seul contenu (les deux reculent, les
      deux nomment un autre message)

## Correctifs

- [x] `emitConversationPreviewUpdate` — seul émetteur qui RECALCULE depuis la
      base — pose `previewRecalculated: true` ; les émetteurs message-driven ne
      le posent pas
- [x] La garde cède devant cette déclaration, et devant elle seule
- [x] Les trois maillons câblés (contrat partagé, décodage, mapping du pont —
      ce dernier perdait déjà `updatedAt` en silence)
- [x] DEUXIÈME surface, trouvée en instruisant la première :
      `ConversationListViewModel` appliquait l'aperçu mais JAMAIS
      `lastMessageAt` — le bon texte au mauvais rang. Corrigé sous le même
      drapeau

## Gates

- [x] 2 RED discriminants gateway vus rouges avant correctif, verts après
- [x] Double prisma COMPLET (l'émetteur avale ses pannes — leçon du cycle 40)
- [x] 1 garde de non-régression : le bump message-driven n'a PAS le drapeau
- [x] 8 témoins Swift (SDK + app), dont les deux contre-épreuves du recul NON
      déclaré
- [x] `bunx tsc --noEmit` gateway : 0 ; `packages/shared` : 0
- [x] Suite gateway complète : 730 suites / 17 802 tests verts
      (cycle 45 : 729 / 17 799 — exactement +1 suite, +3 tests)
- [x] Swift vérifié par `sdk-tests.yml` (aucune toolchain Swift ici)
- [x] CHANGELOG + journal d'audit (cycle46 bis) + leçon 203

## Revue

Voir `tasks/realtime-sync-audit-2026-08-16-cycle46-bis.md` — pourquoi la piste du
cycle 45 se referme sans correctif, le tableau des trois gestes qui recalculent,
pourquoi aucun prédicat sur le payload ne pouvait discriminer, les trois options
écartées (dont l'ordonnancement par `updatedAt`, nommé par le cycle 40 et écarté
sur mesure : son marqueur est nul au démarrage à froid, exactement là où le
défaut se produit), et la piste suivante : le payload « plus AUCUN message
visible » (`lastMessageAt: null`) reste inapplicable côté SDK, faute du même
tri-état que la carte du Prisme a déjà dû introduire.
