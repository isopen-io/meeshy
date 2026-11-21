/**
 * **L'INVENTAIRE DES PORTES À CLÉ D'APPELANT** (#20155).
 *
 * Deux inventaires, et il ne faut jamais les fondre — c'est l'acquis de
 * #20091/#20100, repris ici parce qu'il vaut de toute famille de cliquet :
 *
 * - `PORTES_DELIBEREMENT_LARGES` — « ce site DOIT rester large », avec sa
 *   raison INSTRUITE ;
 * - `PORTES_MESUREES_NON_INSTRUITES` — « on ne sait pas encore ce que ce site
 *   décide », avec sa famille.
 *
 * > « Décidé large » et « pas encore instruit » ne sont pas la même phrase, et
 * > les confondre transforme une dette en autorisation — dans un inventaire
 * > unique, on lira toujours « décidé ».
 *
 * ## Les familles nomment une FORME, jamais un verdict
 *
 * C'est la précaution la plus importante de ce fichier, et elle vient d'une
 * mesure. Le balayage voit *une lecture singulière, keyée sur une identité
 * scalaire, dont la clause n'épelle pas la loi*. Il ne voit **pas** si cette
 * identité est celle de l'APPELANT : `id: authContext.participantId` et
 * `id: message.senderId` ont la même forme et ne posent pas la même question —
 * la première résout l'appelant, la seconde hydrate un TIERS pour le notifier.
 *
 * Un premier jeu d'étiquettes les avait fondues sous « résolution de
 * participant », ce qui se lisait comme un verdict (« ce sont des portes »)
 * alors que ce n'était qu'une forme. Les étiquettes décrivent donc ce qui est
 * LISIBLE, et la question qu'un site de cette liste pose reste entière :
 *
 * > **« Qui AUTORISE ce que cette clause rend ? »** — et il faut suivre la
 * > valeur jusqu'au site qui refuse. Une clause nue n'est pas une fuite : le
 * > `CLAUDE.md` de la passerelle le dit depuis #20183, où cette même question
 * > a mesuré FAUSSE l'affirmation portée sur `messages-send.ts`, dont la clause
 * > figure dans cette liste et dont l'autorisation vit en aval (#10440).
 *
 * ## Ce que la présence d'une ligne ici veut dire, et ne veut pas dire
 *
 * Elle veut dire : « cette lecture est keyée sur une identité et sa clause
 * n'épelle pas la participation vivante ». Elle ne veut PAS dire « défaut » —
 * et la valeur du cliquet n'est pas dans cette liste, elle est dans ce qui la
 * fait TOMBER : une porte NEUVE de cette forme force la question au lot qui
 * l'ajoute, au lieu de la lui laisser découvrir deux jours plus tard par un
 * audit (#20104, #20135, #20136, trois défauts de cette famille livrés en deux
 * jours).
 */
export type FamilleDePorte =
  /** `conversationId` + une identité : l'appartenance de quelqu'un à une conversation. */
  | 'clause-d-appartenance'
  /** `id: X` seul : une ligne nommée par sa clé primaire — appelant OU tiers, la forme ne le dit pas. */
  | 'clause-par-cle-primaire'
  /** Un fichier d'APPEL, qui a ses propres bornes de cycle de vie (`leftAt`). */
  | 'clause-d-appel'
  /** Une identité SANS conversation : la portée vient d'ailleurs, ou de nulle part. */
  | 'clause-par-utilisateur-sans-conversation'
  /**
   * Le fichier vit sous un chemin d'ADMINISTRATION — et c'est TOUT ce que
   * l'étiquette dit.
   *
   * Elle s'appelait `clause-admin` et se décrivait « lit une CIBLE et non
   * l'appelant » : un VERDICT, et précisément celui que l'en-tête de ce
   * fichier déclare illisible pour l'instrument. Le chemin est observable ; ce
   * que la lecture désigne ne l'est pas.
   */
  | 'clause-sous-surface-d-administration'
  /**
   * L'identité comparée EN CODE sur une liste de participants.
   *
   * Elle s'appelait `predicat-sans-loi` — un verdict, et tautologique : toute
   * entrée de `PORTES_MESUREES_NON_INSTRUITES` est nue par construction, donc
   * « sans loi » ne discriminait rien.
   */
  | 'predicat-d-identite-en-code'
  /**
   * Le même prédicat, mais sur `CallSession.participants` — une AUTRE TABLE
   * qui porte le même nom de relation.
   *
   * Le discriminant des prédicats s'ancre sur le NOM de propriété
   * (`participants.some(`), et `CallSession` partage ce nom — le `CLAUDE.md`
   * de la passerelle le dit déjà du cliquet des audiences (« une RELATION, que
   * `CallSession` partage »). Ces lignes sont des portes RÉELLES — l'une garde
   * l'accès à la TRANSCRIPTION d'un appel — mais la loi n'y porte pas sur la
   * ligne lue : elle porte sur le `participant` IMBRIQUÉ
   * (`p.participant?.userId`), donc sur la projection d'en face.
   *
   * Étiquetées à part plutôt qu'écartées : les écarter demanderait au balayage
   * de résoudre un type, et les fondre dans la famille voisine ferait croire
   * qu'un même resserrement les répare.
   */
  | 'predicat-sur-participants-d-appel';

export const PORTES_DELIBEREMENT_LARGES: ReadonlyMap<string, string> = new Map([
  [
    'routes/conversations/utils/target-participant.ts#clause:conversationId, userId: key',
    "La CIBLE d'un geste de gestion, pas l'appelant — largeur instruite SUR PLACE depuis #10465 : « bannir quelqu'un déjà parti est un geste légitime (c'est ce qui l'empêche de revenir par un lien), et c'est l'appelant qui décide ce qu'il exige de l'état ». Resserrer rendrait un banni INTROUVABLE, donc impossible à débannir : la loi appliquée ici retirerait le seul geste qui le répare.",
  ],
  [
    'routes/conversations/utils/target-participant.ts#clause:conversationId, id: key',
    "La même lecture sous l'AUTRE colonne — un invité de lien n'a aucune ligne `User`, sa seule identité est son `Participant.id` (#10465). Même raison, et les deux doivent rester d'accord : resserrer une seule rendrait la cible atteignable sous une identité et pas sous l'autre.",
  ],
  [
    'routes/conversation-encryption.ts#prédicat:(participant) => participant.userId === userId',
    "DÉJÀ INSTRUIT par l'inventaire FRÈRE, qui nomme `memberOf`. `audience-law-inventories.ts` porte `routes/conversation-encryption.ts#0` en `DELIBERATELY_WIDE` : « la lecture UNIQUE des trois routes de régime porte TROIS questions : une PORTE (`memberOf`), un REFUS par égalité exacte (`pairOfMembers` — un tête-à-tête chiffré reste à DEUX, #16188) et une AUDIENCE (`participantUserRooms`). Resserrer servirait la troisième et casserait la deuxième — sur le chemin que rien ne ramène en clair (#12949). C'est la famille de convergence #20093, et elle se tranche là, pas ici. » La CLAUSE doit donc rester large ; le correctif de la PORTE est la loi EN CODE dans `memberOf` (`participationEstVivante(p)`, le patron de `communities/core.ts:780`), jamais un resserrement de `REGIME_SELECT`. Suivi : #20254 pour le prédicat, #20093 pour la convergence de la clause. Reclasser cette ligne en « pas encore instruit » — ce que la première version de cet inventaire faisait — est exactement la confusion que ce fichier existe pour empêcher, prise par l'autre bout.",
  ],
]);

/**
 * **Les deux exemptions ANNONCÉES par #20155 ne sont PAS dans ce relevé, et
 * c'est une mesure, pas un oubli.**
 *
 * Le critère de fin demandait de porter « le créateur d'un groupe (#20100) » et
 * « le créateur d'un lien (#20135) » avec leur raison. Vérifié : aucune des
 * deux ne produit de clé ici, et chacune pour une raison DIFFÉRENTE — ce qui
 * dit quelque chose du périmètre de ce balayage, et pas du dépôt :
 *
 * - le **créateur d'un groupe** est cherché par son RANG (`role`), non par une
 *   identité : sa clause ne nomme personne, donc elle reste une AUDIENCE et
 *   vit dans l'inventaire de l'autre cliquet, à sa place ;
 * - le **créateur d'un lien** se reconnaît à `link.createdBy === userId` — une
 *   colonne de PROPRIÉTÉ sur une AUTRE table. Ni une clause de `Participant`,
 *   ni un prédicat sur une liste de participants : **c'est un troisième genre,
 *   que ce balayage ne couvre pas** (décision produit #20189).
 *
 * > Une exemption qu'on recopie d'une issue sans la confronter au relevé est
 * > une AFFIRMATION. La première version de ce fichier portait une clé
 * > inventée (`access-control.ts#clause:0`) qu'aucun balayage ne produit : un
 * > inventaire qui nomme une clé inexistante ne gèle rien, et se lit pourtant
 * > comme une décision instruite.
 */

/**
 * Mesurées, PAS instruites. Chaque ligne porte sa famille, qui nomme une
 * FORME — voir l'avertissement du haut de ce fichier.
 *
 * Suivi : #20155 (ce cliquet) ; les sites dont l'autorisation vit en aval
 * relèvent de la question du `CLAUDE.md` de la passerelle, pas d'un
 * resserrement mécanique.
 *
 * **Un site de cette liste a déjà son issue : #20254.**
 * `routes/conversation-encryption.ts#prédicat:0` — `REGIME_SELECT` charge ses
 * membres sous `where: { isActive: true }` nu, et `memberOf` les parcourt par
 * `participant.userId === userId` sans loi pour alimenter
 * `actorHasMinimumRole` sur les TROIS routes du régime de chiffrement : un
 * modérateur actif-et-banni agit encore sur le régime E2EE d'une conversation
 * dont il est exclu. Lot de cryptographie et de contrôle d'accès, donc audit
 * adversarial avant fusion (#9226) — pas un resserrement de passage.
 */
/**
 * Mesurées, PAS instruites. Chaque ligne porte sa famille, qui nomme une
 * FORME — voir l'avertissement du haut de ce fichier.
 *
 * Suivi : #20155 (ce cliquet) ; les sites dont l'autorisation vit en aval
 * relèvent de la question du `CLAUDE.md` de la passerelle, pas d'un
 * resserrement mécanique.
 *
 * **Un site de cette liste a déjà son issue : #20254.**
 * `routes/conversation-encryption.ts#prédicat:0` — `REGIME_SELECT` charge ses
 * membres sous `where: { isActive: true }` nu, et `memberOf` les parcourt par
 * `participant.userId === userId` sans loi pour alimenter
 * `actorHasMinimumRole` sur les TROIS routes du régime de chiffrement : un
 * modérateur actif-et-banni agit encore sur le régime E2EE d'une conversation
 * dont il est exclu. Lot de cryptographie et de contrôle d'accès, donc audit
 * adversarial avant fusion (#9226) — pas un resserrement de passage.
 */
export const PORTES_MESUREES_NON_INSTRUITES: ReadonlyMap<string, FamilleDePorte> = new Map([
  ['routes/admin/anonymous-users.ts#clause:id: participantId, type: \'anonymous\'', 'clause-sous-surface-d-administration'],
  ['routes/admin/conversation-settings-sovereign.ts#clause:conversationId: conversation.id, userId, isActive: true', 'clause-sous-surface-d-administration'],
  ['routes/admin/conversation-settings-sovereign.ts#clause:id: participant.id', 'clause-sous-surface-d-administration'],
  ['routes/admin/users.ts#prédicat:(p) => p.userId === userId', 'predicat-d-identite-en-code'],
  ['routes/attachments/metadata.ts#clause:conversationId, userId: authContext.userId, isActive: true,', 'clause-d-appartenance'],
  ['routes/attachments/metadata.ts#clause:conversationId: message.conversationId, userId: authContext.userId, i...', 'clause-d-appartenance'],
  ['routes/attachments/metadata.ts#clause:id: authContext.participantId [0]', 'clause-par-cle-primaire'],
  ['routes/attachments/metadata.ts#clause:id: authContext.participantId [1]', 'clause-par-cle-primaire'],
  ['routes/attachments/metadata.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['routes/calls-consultation.ts#clause:conversationId, userId, isActive: true', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:conversationId: call.conversationId, id: participantId, isActive: true', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:conversationId: call.conversationId, userId, isActive: true [0]', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:conversationId: call.conversationId, userId, isActive: true [1]', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:conversationId: call.conversationId, userId: participantId, isActive:...', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:userId, conversationId, isActive: true', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:userId, conversationId: call.conversationId, isActive: true', 'clause-d-appel'],
  ['routes/conversation-encryption.ts#clause:userId: actorUserId, conversationId: conversation.id, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/core-lifecycle.ts#clause:conversationId: conversationId, userId: userId, isActive: true [0]', 'clause-d-appartenance'],
  ['routes/conversations/core-lifecycle.ts#clause:conversationId: conversationId, userId: userId, isActive: true [1]', 'clause-d-appartenance'],
  ['routes/conversations/core-lifecycle.ts#prédicat:(p: any) => p.userId === userId', 'predicat-d-identite-en-code'],
  ['routes/conversations/core-list.ts#prédicat:(p) => isAnonymousViewer ? p.id === userId : p.userId === userId', 'predicat-d-identite-en-code'],
  ['routes/conversations/delete-for-me.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/leave.ts#clause:conversationId: id, userId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/link-admission.ts#clause:id: entry.participantId', 'clause-par-cle-primaire'],
  ['routes/conversations/message-request.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/messages-advanced-edit.ts#clause:userId: userId, isActive: true', 'clause-par-utilisateur-sans-conversation'],
  ['routes/conversations/messages-list.ts#clause:id: authRequest.authContext.participantId', 'clause-par-cle-primaire'],
  ['routes/conversations/messages-list.ts#clause:userId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/messages-send.ts#clause:userId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/messages-view-once.ts#clause:conversationId: message.conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/messages-view-once.ts#clause:id: authRequest.authContext.participantId, conversationId: message.co...', 'clause-d-appartenance'],
  ['routes/conversations/participant-ban-core.ts#clause:conversationId: id, userId: currentUserId, isActive: true [0]', 'clause-d-appartenance'],
  ['routes/conversations/participant-ban-core.ts#clause:conversationId: id, userId: currentUserId, isActive: true [1]', 'clause-d-appartenance'],
  ['routes/conversations/participant-removal.ts#clause:conversationId: conversationId, userId: currentUserId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/participant-rights-core.ts#clause:id: participantId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/participant-role-core.ts#clause:conversationId: conversationId, userId: currentUserId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/participant-role-core.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['routes/conversations/participants-reads.ts#clause:id: participantId, conversationId', 'clause-d-appartenance'],
  ['routes/conversations/participants-writes.ts#clause:conversationId: conversationId, userId: currentUserId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/readerParticipant.ts#clause:conversationId, userId: authContext.userId, isActive: true', 'clause-d-appartenance'],
  ['routes/conversations/restore-for-me.ts#clause:conversationId, userId', 'clause-d-appartenance'],
  ['routes/conversations/restore-for-me.ts#clause:id: participant.id', 'clause-par-cle-primaire'],
  ['routes/conversations/shared-translations.ts#clause:id: caller.id', 'clause-par-cle-primaire'],
  ['routes/messages-reads.ts#clause:conversationId: message.conversationId, userId: userId, isActive: true', 'clause-d-appartenance'],
  ['routes/messages-reads.ts#clause:userId: userId, isActive: true', 'clause-par-utilisateur-sans-conversation'],
  ['routes/reports/target.ts#clause:conversationId, userId: qui.userId, isActive: true', 'clause-d-appartenance'],
  ['routes/reports/target.ts#clause:id: qui.participantId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['routes/signal-protocol.ts#clause:userId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['routes/signal-protocol.ts#clause:userId: recipientUserId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['routes/tracking-links/creation.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['routes/translation-non-blocking.ts#clause:userId: authContext.userId, conversationId: resolvedConversationId, i...', 'clause-d-appartenance'],
  ['routes/user-deletions.ts#clause:conversationId, userId, isActive: true,', 'clause-d-appartenance'],
  ['routes/user-deletions.ts#clause:userId, isActive: true', 'clause-par-utilisateur-sans-conversation'],
  ['services/CallService.ts#clause:conversationId, id: participantId, isActive: true', 'clause-d-appel'],
  ['services/CallService.ts#clause:conversationId: call.conversationId, id: participantId, ...(call.invi...', 'clause-d-appel'],
  ['services/CallService.ts#clause:userId: call.initiatorId, conversationId: call.conversationId [0]', 'clause-d-appel'],
  ['services/CallService.ts#clause:userId: call.initiatorId, conversationId: call.conversationId [1]', 'clause-d-appel'],
  ['services/CallService.ts#prédicat:(p) => p.participant?.userId === requestingUserId', 'predicat-sur-participants-d-appel'],
  ['services/EphemeralRecipientExpiryService.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/InitService.ts#clause:conversationId: globalConversation.id, userId: adminUser.id', 'clause-d-appartenance'],
  ['services/InitService.ts#clause:conversationId: globalConversation.id, userId: bigbossUser.id', 'clause-d-appartenance'],
  ['services/MentionService.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['services/MessageMediaConsumptionService.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/MessageReadStatusService.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/appearance/conversationAppearanceGuard.ts#clause:userId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['services/attachments/attachmentUseAdmission.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['services/attachments/uploaderIdentity.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/attachments/uploaderIdentity.ts#clause:id: uploadedBy', 'clause-par-cle-primaire'],
  ['services/calls/callHistoryList.ts#clause:userId, isActive: true', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:conversationId: call.conversationId, userId: input.userId [0]', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:conversationId: call.conversationId, userId: input.userId [1]', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:conversationId: input.conversationId, userId: input.inviteeUserId', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:conversationId: input.conversationId, userId: input.inviterUserId, is...', 'clause-d-appel'],
  ['services/calls/callSessionReadAccess.ts#clause:conversationId: call.conversationId, userId', 'clause-d-appel'],
  ['services/calls/callSessionReadAccess.ts#clause:conversationId: call.conversationId, userId, isActive: true', 'clause-d-appel'],
  ['services/conversationPreferencesSync.ts#clause:userId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['services/conversations/ensureGlobalConversationMembership.ts#clause:conversationId: globalConversation.id, userId: input.userId', 'clause-d-appartenance'],
  ['services/conversations/shareLinkArrivalAnnounce.ts#clause:id: params.participantId', 'clause-par-cle-primaire'],
  ['services/e2ee/E2EESignalRelay.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['services/e2ee/key-access.ts#clause:userId: targetUserId, conversationId: { in: conversationIds }, isActi...', 'clause-d-appartenance'],
  ['services/external-conversation/open-external-conversation.ts#clause:userId, isActive: true', 'clause-par-utilisateur-sans-conversation'],
  ['services/message-translation/MessageTranslationService.ts#clause:id: attachment.message.senderId', 'clause-par-cle-primaire'],
  ['services/message-translation/MessageTranslationService.ts#clause:id: message.senderId', 'clause-par-cle-primaire'],
  ['services/messaging/MessageProcessor.ts#clause:id: senderId', 'clause-par-cle-primaire'],
  ['services/messaging/MessageProcessor.ts#clause:id: senderParticipantId', 'clause-par-cle-primaire'],
  ['services/messaging/MessagingService.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/messaging/MessagingService.ts#clause:userId, conversationId', 'clause-d-appartenance'],
  ['services/messaging/conversationWriteAdmission.ts#clause:id: params.senderParticipantId', 'clause-par-cle-primaire'],
  ['services/messaging/conversationWriteAdmission.ts#clause:id: senderParticipantId', 'clause-par-cle-primaire'],
  ['services/messaging/copyAttachments.ts#clause:id: params.requesterParticipantId', 'clause-par-cle-primaire'],
  ['services/messaging/e2eeSendAdmission.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/messaging/ephemeralCountdown.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/messaging/messageDeleteAdmission.ts#clause:conversationId: message.conversationId, userId: deleterUserId, isActi...', 'clause-d-appartenance'],
  ['services/messaging/messageEditAdmission.ts#clause:conversationId, userId, isActive: true', 'clause-d-appartenance'],
  ['services/messaging/messageMentions.ts#clause:id: message.senderId', 'clause-par-cle-primaire'],
  ['services/messaging/messageNotificationFanOut.ts#clause:id: originalMessage.senderId', 'clause-par-cle-primaire'],
  ['services/messaging/messageNotificationFanOut.ts#clause:id: senderParticipantId', 'clause-par-cle-primaire'],
  ['services/messaging/messageReadAccess.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/messaging/messageRequests.ts#clause:conversationId: params.conversationId, isActive: true, userId: params...', 'clause-d-appartenance'],
  ['services/messaging/messageRequests.ts#clause:conversationId: params.conversationId, userId: params.userId, isActiv...', 'clause-d-appartenance'],
  ['services/messaging/messageRequests.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/messaging/storyReplyAdmission.ts#clause:conversationId: params.conversationId, userId: story.authorId, isActi...', 'clause-d-appartenance'],
  ['services/messaging/storyReplyAdmission.ts#clause:id: senderParticipantId', 'clause-par-cle-primaire'],
  ['services/notifications/reactionNotify.ts#clause:id: message.senderId', 'clause-par-cle-primaire'],
  ['services/notifications/reactionNotify.ts#clause:id: params.reactorParticipantId [0]', 'clause-par-cle-primaire'],
  ['services/notifications/reactionNotify.ts#clause:id: params.reactorParticipantId [1]', 'clause-par-cle-primaire'],
  ['services/posts/directContactVisibility.ts#clause:userId: b, isActive: true, conversationId: { in: aMemberships.map((m)...', 'clause-d-appartenance'],
  ['services/relations/messageInteractions.ts#prédicat:(p) => p.userId === sender && (p.messageRequestAt instanceof Date || ...', 'predicat-d-identite-en-code'],
  ['services/reports/reportedContentAuthor.ts#clause:id: senderId', 'clause-par-cle-primaire'],
  ['services/talkie/talkieGate.ts#clause:userId: b, isActive: true, conversationId: { in: mine.map((m) => m.co...', 'clause-d-appartenance'],
  ['services/unreadCountOfParticipant.ts#clause:conversationId, isActive: true, OR: [ { id: participantIdOrUserId }, ...', 'clause-d-appartenance'],
  ['services/voice-cloning-gate.ts#clause:id: participantId', 'clause-par-cle-primaire'],
  ['services/world/worldConversation.ts#clause:conversationId, userId: account.id', 'clause-d-appartenance'],
  ['services/world/worldParticipantCard.ts#clause:id: participantId, conversationId: world.id', 'clause-d-appartenance'],
  ['socketio/CallEventsHandler.ts#clause:conversationId: data.conversationId, userId, isActive: true', 'clause-d-appel'],
  ['socketio/MeeshySocketIOManager.ts#clause:id: message.senderId', 'clause-par-cle-primaire'],
  ['socketio/MeeshySocketIOManager.ts#clause:id: userId', 'clause-par-cle-primaire'],
  ['socketio/agent-response-bridge.ts#clause:userId: response.asUserId, conversationId: response.conversationId, i...', 'clause-d-appartenance'],
  ['socketio/call-invite-events.ts#clause:conversationId: request.conversationId, userId: request.inviterUserId...', 'clause-d-appel'],
  ['socketio/call-invite-lifecycle.ts#clause:conversationId: invitation.conversationId, userId: invitation.invitee...', 'clause-d-appel'],
  ['socketio/handlers/ConversationHandler.ts#clause:conversationId: normalizedId, userId', 'clause-d-appartenance'],
  ['socketio/handlers/LocationHandler.ts#clause:id: context.participantId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['socketio/handlers/LocationHandler.ts#clause:userId: context.userId, conversationId, isActive: true', 'clause-d-appartenance'],
  ['socketio/handlers/StatusHandler.ts#clause:id: userId', 'clause-par-cle-primaire'],
  ['socketio/handlers/StatusHandler.ts#prédicat:(p) => p.userId === userId', 'predicat-d-identite-en-code'],
  ['socketio/handlers/guestLinkWatch.ts#clause:id: guest.id', 'clause-par-cle-primaire'],
  ['socketio/utils/participant-resolver.ts#clause:id: anonymousParticipantId, conversationId', 'clause-d-appartenance'],
  ['socketio/utils/participant-resolver.ts#clause:userId, conversationId', 'clause-d-appartenance'],
] as ReadonlyArray<readonly [string, FamilleDePorte]>);

/** Ce que le balayage PUBLIE faute de savoir le juger — jamais de silence (#20091). */
export const PORTES_NON_JUGEABLES_GELEES: ReadonlyArray<string> = [
  'routes/conversations/participant-rights-core.ts#clause/where-illisible:0',
  'routes/conversations/participants-reads.ts#clause/where-illisible:0',
  'routes/conversations/participants-reads.ts#clause/where-illisible:1',
  'routes/conversations/utils/list-activity.ts#clause/where-illisible:0',
  'routes/messages-reads.ts#clause/where-illisible:0',
  'routes/messages-reads.ts#clause/where-illisible:1',
  'routes/messages-writes.ts#clause/where-illisible:0',
  'routes/reactions.ts#clause/where-illisible:0',
  'routes/reactions.ts#prédicat/source-ambigue:0',
  'routes/reactions.ts#prédicat/source-ambigue:1',
  'services/MentionService.ts#clause/where-illisible:0',
  'services/MentionService.ts#prédicat/source-ambigue:0',
  'services/ReactionService.ts#clause/where-illisible:0',
  'services/ReactionService.ts#prédicat/source-ambigue:0',
  'services/ReactionService.ts#prédicat/source-ambigue:1',
  'services/calls/callSessionReadAccess.ts#prédicat/source-introuvable:0',
  'services/historyFloor.ts#clause/where-illisible:0',
  'services/messaging/captureNoticeVisibility.ts#clause/where-illisible:0',
  'services/messaging/captureNoticeVisibility.ts#clause/where-illisible:1',
  'services/messaging/messageReadAccess.ts#clause/where-illisible:0',
  'services/shareLinkReadGate.ts#clause/where-illisible:0',
  'socketio/CallEventsHandler.ts#prédicat/source-ambigue:0',
];
