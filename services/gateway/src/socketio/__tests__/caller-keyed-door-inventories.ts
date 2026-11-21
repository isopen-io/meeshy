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
  /** La signalisation d'appel, qui a ses propres bornes de cycle de vie (`leftAt`). */
  | 'clause-d-appel'
  /** Une identité SANS conversation : la portée vient d'ailleurs, ou de nulle part. */
  | 'clause-par-utilisateur-sans-conversation'
  /** Une surface d'administration, qui lit une CIBLE et non l'appelant. */
  | 'clause-admin'
  /** L'identité comparée en CODE, sur une liste que la clause n'a pas restreinte. */
  | 'predicat-sans-loi'
  /**
   * Le même prédicat, mais sur `CallSession.participants` — une AUTRE TABLE
   * qui porte le même nom de relation.
   *
   * Le discriminant des prédicats s'ancre sur le NOM de propriété
   * (`participants.some(`), et `CallSession` partage ce nom — le `CLAUDE.md`
   * de la passerelle le dit déjà du cliquet des audiences (« une RELATION, que
   * `CallSession` partage »). Ces lignes sont donc des portes RÉELLES — la
   * première garde l'accès à la TRANSCRIPTION d'un appel — mais la loi n'y
   * porte pas sur la ligne lue : elle porte sur le `participant` IMBRIQUÉ
   * (`p.participant?.userId`), donc sur la projection d'en face.
   *
   * Elles sont étiquetées à part plutôt qu'écartées : les écarter demanderait
   * au balayage de résoudre un type, et les fondre dans la famille voisine
   * ferait croire qu'un même resserrement les répare.
   */
  | 'predicat-sur-participants-d-appel';

/**
 * Les portes dont la LARGEUR est une décision, avec sa raison.
 *
 * Les deux premières étaient déjà instruites avant ce lot, et ce balayage les
 * PORTE plutôt que de les redécouvrir — c'est la troisième exigence du critère
 * de fin de #20155.
 */
export const PORTES_DELIBEREMENT_LARGES: ReadonlyMap<string, string> = new Map([
  [
    'routes/conversations/utils/target-participant.ts#clause:0',
    "La CIBLE d'un geste de gestion, pas l'appelant — et sa largeur est instruite SUR PLACE depuis #10465 : « bannir quelqu'un déjà parti est un geste légitime (c'est ce qui l'empêche de revenir par un lien), et c'est l'appelant qui décide ce qu'il exige de l'état ». Resserrer ici rendrait un banni INTROUVABLE, donc impossible à débannir : la loi appliquée à ce site retirerait le seul geste qui le répare.",
  ],
  [
    'routes/conversations/utils/target-participant.ts#clause:1',
    "La même lecture sous l'AUTRE colonne — un invité de lien n'a aucune ligne `User`, sa seule identité est son `Participant.id` (#10465). Même raison, et les deux doivent rester d'accord : resserrer une seule des deux rendrait la cible atteignable sous une identité et pas sous l'autre.",
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
export const PORTES_MESUREES_NON_INSTRUITES: ReadonlyMap<string, FamilleDePorte> = new Map([
  ['routes/admin/anonymous-users.ts#clause:0', 'clause-admin'],
  ['routes/admin/conversation-settings-sovereign.ts#clause:0', 'clause-admin'],
  ['routes/admin/conversation-settings-sovereign.ts#clause:1', 'clause-admin'],
  ['routes/admin/users.ts#prédicat:0', 'predicat-sans-loi'],
  ['routes/attachments/metadata.ts#clause:0', 'clause-par-cle-primaire'],
  ['routes/attachments/metadata.ts#clause:1', 'clause-d-appartenance'],
  ['routes/attachments/metadata.ts#clause:2', 'clause-par-cle-primaire'],
  ['routes/attachments/metadata.ts#clause:3', 'clause-par-cle-primaire'],
  ['routes/attachments/metadata.ts#clause:4', 'clause-d-appartenance'],
  ['routes/calls-consultation.ts#clause:0', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:0', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:1', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:2', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:3', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:4', 'clause-d-appel'],
  ['routes/calls-lifecycle.ts#clause:5', 'clause-d-appel'],
  ['routes/conversation-encryption.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversation-encryption.ts#prédicat:0', 'predicat-sans-loi'],
  ['routes/conversations/core-lifecycle.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/core-lifecycle.ts#clause:1', 'clause-d-appartenance'],
  ['routes/conversations/core-lifecycle.ts#prédicat:0', 'predicat-sans-loi'],
  ['routes/conversations/core-list.ts#prédicat:0', 'predicat-sans-loi'],
  ['routes/conversations/delete-for-me.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/leave.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/link-admission.ts#clause:0', 'clause-par-cle-primaire'],
  ['routes/conversations/message-request.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/messages-advanced-edit.ts#clause:0', 'clause-par-utilisateur-sans-conversation'],
  ['routes/conversations/messages-list.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/messages-list.ts#clause:1', 'clause-par-cle-primaire'],
  ['routes/conversations/messages-send.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/messages-view-once.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/messages-view-once.ts#clause:1', 'clause-d-appartenance'],
  ['routes/conversations/participant-ban-core.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/participant-ban-core.ts#clause:1', 'clause-d-appartenance'],
  ['routes/conversations/participant-removal.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/participant-rights-core.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/participant-role-core.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/participant-role-core.ts#clause:1', 'clause-par-cle-primaire'],
  ['routes/conversations/participants-reads.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/participants-writes.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/readerParticipant.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/restore-for-me.ts#clause:0', 'clause-d-appartenance'],
  ['routes/conversations/restore-for-me.ts#clause:1', 'clause-par-cle-primaire'],
  ['routes/conversations/shared-translations.ts#clause:0', 'clause-par-cle-primaire'],
  ['routes/messages-reads.ts#clause:0', 'clause-d-appartenance'],
  ['routes/messages-reads.ts#clause:1', 'clause-par-utilisateur-sans-conversation'],
  ['routes/reports/target.ts#clause:0', 'clause-d-appartenance'],
  ['routes/reports/target.ts#clause:1', 'clause-d-appartenance'],
  ['routes/signal-protocol.ts#clause:0', 'clause-d-appartenance'],
  ['routes/signal-protocol.ts#clause:1', 'clause-d-appartenance'],
  ['routes/tracking-links/creation.ts#clause:0', 'clause-d-appartenance'],
  ['routes/translation-non-blocking.ts#clause:0', 'clause-d-appartenance'],
  ['routes/user-deletions.ts#clause:0', 'clause-d-appartenance'],
  ['routes/user-deletions.ts#clause:1', 'clause-par-utilisateur-sans-conversation'],
  ['services/CallService.ts#clause:0', 'clause-d-appel'],
  ['services/CallService.ts#clause:1', 'clause-d-appel'],
  ['services/CallService.ts#clause:2', 'clause-d-appel'],
  ['services/CallService.ts#clause:3', 'clause-d-appel'],
  ['services/CallService.ts#prédicat:0', 'predicat-sur-participants-d-appel'],
  ['services/EphemeralRecipientExpiryService.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/InitService.ts#clause:0', 'clause-d-appartenance'],
  ['services/InitService.ts#clause:1', 'clause-d-appartenance'],
  ['services/MentionService.ts#clause:0', 'clause-d-appartenance'],
  ['services/MessageMediaConsumptionService.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/MessageReadStatusService.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/appearance/conversationAppearanceGuard.ts#clause:0', 'clause-d-appartenance'],
  ['services/attachments/attachmentUseAdmission.ts#clause:0', 'clause-d-appartenance'],
  ['services/attachments/uploaderIdentity.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/attachments/uploaderIdentity.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/calls/callHistoryList.ts#clause:0', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:0', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:1', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:2', 'clause-d-appel'],
  ['services/calls/callInvitation.ts#clause:3', 'clause-d-appel'],
  ['services/calls/callSessionReadAccess.ts#clause:0', 'clause-d-appel'],
  ['services/calls/callSessionReadAccess.ts#clause:1', 'clause-d-appel'],
  ['services/conversationPreferencesSync.ts#clause:0', 'clause-d-appartenance'],
  ['services/conversations/ensureGlobalConversationMembership.ts#clause:0', 'clause-d-appartenance'],
  ['services/conversations/shareLinkArrivalAnnounce.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/e2ee/E2EESignalRelay.ts#clause:0', 'clause-d-appartenance'],
  ['services/e2ee/key-access.ts#clause:0', 'clause-d-appartenance'],
  ['services/external-conversation/open-external-conversation.ts#clause:0', 'clause-par-utilisateur-sans-conversation'],
  ['services/message-translation/MessageTranslationService.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/message-translation/MessageTranslationService.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/messaging/MessageProcessor.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/MessageProcessor.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/messaging/MessagingService.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/MessagingService.ts#clause:2', 'clause-d-appartenance'],
  ['services/messaging/conversationWriteAdmission.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/conversationWriteAdmission.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/messaging/copyAttachments.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/e2eeSendAdmission.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/ephemeralCountdown.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/messageDeleteAdmission.ts#clause:0', 'clause-d-appartenance'],
  ['services/messaging/messageEditAdmission.ts#clause:0', 'clause-d-appartenance'],
  ['services/messaging/messageMentions.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/messageNotificationFanOut.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/messageNotificationFanOut.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/messaging/messageReadAccess.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/messaging/messageRequests.ts#clause:0', 'clause-d-appartenance'],
  ['services/messaging/messageRequests.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/messaging/messageRequests.ts#clause:2', 'clause-d-appartenance'],
  ['services/messaging/storyReplyAdmission.ts#clause:0', 'clause-d-appartenance'],
  ['services/messaging/storyReplyAdmission.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/notifications/reactionNotify.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/notifications/reactionNotify.ts#clause:1', 'clause-par-cle-primaire'],
  ['services/notifications/reactionNotify.ts#clause:2', 'clause-par-cle-primaire'],
  ['services/posts/directContactVisibility.ts#clause:0', 'clause-d-appartenance'],
  ['services/reports/reportedContentAuthor.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/talkie/talkieGate.ts#clause:0', 'clause-d-appartenance'],
  ['services/unreadCountOfParticipant.ts#clause:0', 'clause-d-appartenance'],
  ['services/voice-cloning-gate.ts#clause:0', 'clause-par-cle-primaire'],
  ['services/world/worldConversation.ts#clause:0', 'clause-d-appartenance'],
  ['services/world/worldParticipantCard.ts#clause:0', 'clause-d-appartenance'],
  ['socketio/CallEventsHandler.ts#clause:0', 'clause-d-appel'],
  ['socketio/CallEventsHandler.ts#prédicat:0', 'predicat-sur-participants-d-appel'],
  ['socketio/MeeshySocketIOManager.ts#clause:0', 'clause-par-cle-primaire'],
  ['socketio/MeeshySocketIOManager.ts#clause:2', 'clause-par-cle-primaire'],
  ['socketio/agent-response-bridge.ts#clause:0', 'clause-d-appartenance'],
  ['socketio/call-invite-events.ts#clause:0', 'clause-d-appel'],
  ['socketio/call-invite-lifecycle.ts#clause:0', 'clause-d-appel'],
  ['socketio/handlers/ConversationHandler.ts#clause:1', 'clause-d-appartenance'],
  ['socketio/handlers/LocationHandler.ts#clause:0', 'clause-d-appartenance'],
  ['socketio/handlers/LocationHandler.ts#clause:1', 'clause-d-appartenance'],
  ['socketio/handlers/StatusHandler.ts#clause:0', 'clause-par-cle-primaire'],
  ['socketio/handlers/guestLinkWatch.ts#clause:0', 'clause-par-cle-primaire'],
  ['socketio/utils/participant-resolver.ts#clause:2', 'clause-d-appartenance'],
  ['socketio/utils/participant-resolver.ts#clause:3', 'clause-d-appartenance'],
] as ReadonlyArray<readonly [string, FamilleDePorte]>);

/** Ce que le balayage PUBLIE faute de savoir le juger — jamais de silence (#20091). */
export const PORTES_NON_JUGEABLES_GELEES: ReadonlyArray<string> = [
  'routes/conversations/participant-rights-core.ts#clause/where-illisible',
  'routes/conversations/participants-reads.ts#clause/where-illisible',
  'routes/conversations/participants-reads.ts#clause/where-illisible',
  'routes/conversations/utils/list-activity.ts#clause/where-illisible',
  'routes/messages-reads.ts#clause/where-illisible',
  'routes/messages-reads.ts#clause/where-illisible',
  'routes/messages-writes.ts#clause/where-illisible',
  'routes/reactions.ts#clause/where-illisible',
  'routes/reactions.ts#prédicat/source-ambigue',
  'routes/reactions.ts#prédicat/source-ambigue',
  'services/MentionService.ts#clause/where-illisible',
  'services/MentionService.ts#prédicat/source-introuvable',
  'services/ReactionService.ts#clause/where-illisible',
  'services/ReactionService.ts#prédicat/source-ambigue',
  'services/ReactionService.ts#prédicat/source-ambigue',
  'services/calls/callSessionReadAccess.ts#prédicat/source-introuvable',
  'services/historyFloor.ts#clause/where-illisible',
  'services/messaging/captureNoticeVisibility.ts#clause/where-illisible',
  'services/messaging/captureNoticeVisibility.ts#clause/where-illisible',
  'services/messaging/captureNoticeVisibility.ts#prédicat/source-introuvable',
  'services/messaging/messageReadAccess.ts#clause/where-illisible',
  'services/relations/messageInteractions.ts#prédicat/source-introuvable',
  'services/shareLinkReadGate.ts#clause/where-illisible',
  'socketio/emitConversationPreviewUpdate.ts#prédicat/source-introuvable',
  'socketio/handlers/StatusHandler.ts#prédicat/source-introuvable',
];
