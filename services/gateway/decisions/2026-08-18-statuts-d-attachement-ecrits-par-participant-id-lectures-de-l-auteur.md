## 2026-08-18 : Statuts d'attachement écrits par PARTICIPANT.id + lectures de l'AUTEUR comptées

**Statut**: Accepté (directive utilisateur : « remonter les lectures de l'audio même si c'est l'auteur qui le lit »)

**Contexte**: `POST /attachments/:id/status` passait `authContext.userId` (User.id pour un inscrit) à `markAudioAsListened`/`markVideoAsWatched`/`markImageAsViewed`/`markAttachmentAsDownloaded`, alors que `AttachmentStatusEntry.participantId` attend un Participant.id (comme `Message.senderId`). Les lignes écrites étaient orphelines : filtrées en lecture (`if (!participant) return null`), invisibles au cross-device — l'onglet « Écouté » restait vide pour TOUT LE MONDE. Par ailleurs `getMessageReadStatus` excluait l'auteur (`participantId: { not: senderId }`) et les compteurs dénormalisés l'excluaient aussi.

**Décision**:
1. La route résout le participant (`select: { id, userId }`) et écrit sous `participant.id` — même patron que la route mark-read (« participantId, pas userId »).
2. `getMessageReadStatus.attachmentConsumption` inclut l'AUTEUR (le filtre senderId saute).
3. `updateAttachmentComputedStatus` tient DEUX jeux de comptes : AFFICHÉS (`viewedCount`/`downloadedCount`/`consumedCount`) auteur-INCLUS ; COMPLÉTUDE (`…ByAllAt`) auteur-EXCLUE des deux côtés — sinon l'écoute de l'auteur allumerait « écouté par tous » avant le premier destinataire.
4. Parité web : `use-audio-playback`/`use-video-playback` ne gatent plus `isOwnMessage` dans `trackConsumption` (iOS n'a jamais eu de gate auteur).

**Alternatives rejetées**:
- *Compter l'auteur aussi dans `…ByAllAt`* : fausse la sémantique destinataires ; un vocal « écouté par tous » ne doit rien devoir à son auteur.
- *Ne corriger que le gate auteur sans l'ID* : aucune écoute — auteur ou non — n'était restituée ; le bug d'identifiant neutralisait tout le pipeline.

**Conséquences**: les lignes orphelines historiques (clées par User.id) restent en base mais sont neutralisées PARTOUT — en lecture (`if (!participant) return null`) ET dans les compteurs dénormalisés (`participant: { conversationId }` sur les 12 requêtes de `updateAttachmentComputedStatus` ; sans ce filtre elles comptaient double et allumaient des « écouté par tous » fantômes) ; les anonymes restent bloqués par la garde `participants.where.userId` (préexistant, hors périmètre).

---
