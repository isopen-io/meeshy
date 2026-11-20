# Le plafond de l'audience vivante TRONQUE en le journalisant, et ce qu'il nomme part en UNE émission (2026-11-20, #20007)

## La décision

Les cinq familles de mutation qui ne portent que des **ids** — `message:deleted`,
`message:expired`, `message:pinned`, `message:unpinned`, et les deux faits de vue
unique (`message:consumed`, `message:view-once-purged`) — s'adressent à la room
de conversation **et** aux rooms personnelles des participants vivants
(#18556, #19943).

- **Le plafond ne JETTE plus.** `LIVE_AUDIENCE_SCAN_CAP` passe de 2 000 à
  **50 000** et, dépassé, **tronque en le journalisant**. Il rendait `[]`, et la
  diffusion repliait sur `conversation:<id>` seule — où un lecteur resté sur la
  LISTE ne reçoit rien : le défaut de #18556 et #19943 rétabli au-dessus d'un
  seuil, silencieusement.
- **Ce qu'il borne est la MÉMOIRE, pas la base.** L'enfilage hors ligne de la
  même mutation relit ces mêmes lignes, même `where`, même `select`, **sans
  plafond**, quelques lignes plus bas dans le même appel
  (`offlineParticipantQueue`) : le plafond ne protégeait aucun coût de lecture.
  Cette dette a son issue (#20020).
- **UNE lecture, sans tri.** `ServerEmitIO.to` acceptant `string | string[]`
  depuis le cycle 108, une audience de 50 000 part en une seule émission.
- **UNE émission, parce que Socket.IO ne dédoublonne que par émission.** Le
  dédoublonnage porte donc sur l'audience ENTIÈRE — y compris les deux lignes
  vivantes qu'un même compte peut avoir (inscrit entré aussi par un lien,
  `@@unique([conversationId, userId, sessionTokenHash])`).
- **`complete` sépare l'affirmation de l'ignorance.** `targets: []` disait à la
  fois « aucun participant vivant » et « la lecture n'a rien prouvé ». La
  distinction ne change rien à l'émission (les deux replient sur la room de
  conversation) ; elle est la condition pour que cette lecture soit un jour
  PARTAGÉE avec la file hors ligne, où `[]` vaut « personne » et n'enfile pour
  personne (cycle 116).

## Ce que la décision ÉCARTE, et pourquoi

Une première version PAGINAIT la lecture (curseur sur `id`) et émettait **par
lots**, en assumant une double livraison pour les sockets présents à la fois dans
la room de conversation et dans un lot ultérieur. L'audit adversarial du lot l'a
écartée, sur trois mesures :

1. la fonction ACCUMULAIT toutes les pages avant de rendre — « rien n'est gardé
   en mémoire plus longtemps que sa propre diffusion » était FAUX contre son
   propre code, et donc **découper la portée de dédoublonnage ne gagnait rien** ;
2. l'alternative exacte n'exigeait pas `.except` ni d'élargir la porte
   d'émission : un seul `to(tableau)` suffit, ce que trois jumelles du dépôt font
   déjà (`broadcastReadStatus`, `emitAttachmentUpdated`,
   `autoDeliverToOnlineRecipients`) ;
3. `orderBy: { id: 'asc' }` n'est servi par **aucun index** de `Participant`
   (`@@index([conversationId, isActive])` ne porte pas `_id`) : la pagination
   payait un TRI BLOQUANT par page sur un chemin chaud, là où la lecture sans tri
   se stream depuis l'index. Elle ajoutait en prime une course — un curseur
   désigne une LIGNE, et `cleanupExpiredData` supprime physiquement des
   participants anonymes vivants, ce qui faisait rendre `complete: true` à tort,
   sans journal.

**#20021 est donc sans objet** : il n'y a ni lot, ni doublon, ni porte à
élargir.

## Ce que la décision ne change pas

- **L'ÉDITION garde son audience propre**, gardée par `readership`
  (`editedAudience.ts`) : son texte n'est pas un id.
- **La révélation d'EXISTENCE** d'un message hors du plancher d'historique est
  inchangée — élargir l'audience des familles d'ids élargit d'autant la
  population qui apprend qu'un id existe, ce qui était déjà vrai de #18556 et de
  #19943. Suivie par **#17029** (la décision produit) et **#18681** (le rejeu).
- **La participation BANNIE n'est pas nommée** : la loi reste
  `PARTICIPATION_VIVANTE` (`isActive: true` et `bannedAt` nul ou absent), et elle
  a désormais son témoin — retirer la clause `bannedAt` fait rougir quatre
  témoins d'audience, contre aucun avant ce lot.
- **Aucun index, aucune migration** : la requête est celle d'avant le lot, à la
  valeur du `take` près.

## Sites

`socketio/conversationAudienceRooms.ts` (`loadLiveAudience`,
`conversationAudienceRooms`, `filterLiveAudience`), consommé par
`broadcastMessageMutation`, `broadcastViewOnceFact` et
`MessageHandler.handleMessageDelete`. Double de test qui EXIGE la borne :
`__tests__/helpers/live-audience-double.ts`.
