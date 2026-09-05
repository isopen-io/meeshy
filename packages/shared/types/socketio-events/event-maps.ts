/**
 * L'ASSEMBLAGE : les deux cartes qui donnent une signature à chaque nom du
 * contrat, et les cliquets de type qui les gardent.
 *
 * Ce module est le seul à référencer TOUS les domaines — c'est ce qui
 * l'empêche d'être découpé par domaine : il EST le point de rencontre. Le
 * graphe reste un DAG, aucune arête n'en revient.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// Import pour les événements sociaux (posts, stories, statuts, commentaires)
import type {
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  CommentMediaUpdatedEventData,
  CommentReactionSyncEventData,
  CommentReactionUpdateEventData,
  CommentTranslationUpdatedEventData,
  CommentUnlikedEventData,
  CommentUpdatedEventData,
  PostBookmarkedEventData,
  PostCreatedEventData,
  PostDeletedEventData,
  PostLikedEventData,
  PostReactionAddData,
  PostReactionRemoveData,
  PostReactionSyncEventData,
  PostReactionUpdateEventData,
  PostRepostedEventData,
  PostTranslationUpdatedEventData,
  PostUnlikedEventData,
  PostUpdatedEventData,
  StatusCreatedEventData,
  StatusDeletedEventData,
  StatusReactedEventData,
  StatusUnreactedEventData,
  StatusUpdatedEventData,
  StoryCreatedEventData,
  StoryDeletedEventData,
  StoryReactedEventData,
  StoryUnreactedEventData,
  StoryUpdatedEventData,
  StoryViewedEventData,
} from '../post.js';

// La ligne de réaction persistée — ce que l'accusé de `reaction:add` porte.
import type { ReactionData } from '../reaction.js';

// Import pour les événements d'appels vidéo
import type {
  CallAlreadyAnsweredEvent,
  CallAnalyticsEvent,
  CallAudioChunkEvent,
  CallEndedEvent,
  CallError,
  CallForceLeaveClientEvent,
  CallForceLeaveServerEvent,
  CallHeartbeatEvent,
  CallIceServersRefreshedEvent,
  CallInitiateAck,
  CallInitiateEvent,
  CallInitiatedEvent,
  CallJoinAck,
  CallJoinEvent,
  CallMediaToggleClientEvent,
  CallMediaToggleEvent,
  CallMissedEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallQualityAlertEvent,
  CallQualityFeedbackEvent,
  CallQualityReportEvent,
  CallReconnectedEvent,
  CallReconnectingEvent,
  CallRequestIceServersEvent,
  CallScreenCaptureEvent,
  CallSignalEvent,
  CallTranscriptionActiveBroadcast,
  CallTranscriptionActiveEvent,
  CallTranscriptionCapabilityEvent,
  CallTranscriptionResultEvent,
  CallTranscriptionRoleEvent,
  CallTranscriptionSegmentEvent,
  CallTranslatedSegmentEvent,
  CallTranslationEnabledEvent,
  CallTranslationRequestEvent,
  CallTranslationRequestedEvent,
  CallTranslationResponseEvent,
} from '../video-call.js';

import type { AgentAdminEventData } from './agent.js';
import type { AttachmentStatusUpdatedEventData, AttachmentUpdatedEventData } from './attachment.js';
import type {
  AudioTranslationFailedEventData,
  AudioTranslationReadyEventData,
  AudioTranslationsCompletedEventData,
  AudioTranslationsProgressiveEventData,
  TranscriptionFailedEventData,
  TranscriptionReadyEventData,
  TranslationFailedEventData,
} from './audio.js';
import type {
  AuthSessionRevokedEventData,
  AuthTokenExpiredEventData,
  AuthenticateData,
  AuthenticatedEventData,
  ErrorEventData,
  HeartbeatAckEventData,
} from './auth.js';
import type {
  CategoriesReorderedEventData,
  CategoryCreatedEventData,
  CategoryDeletedEventData,
  CategoryUpdatedEventData,
} from './category.js';
import type {
  ConversationActionData,
  ConversationClosedEventData,
  ConversationDeletedEventData,
  ConversationJoinErrorEventData,
  ConversationNewEventData,
  ConversationParticipationEventData,
  ConversationRestoredEventData,
  ConversationStatsEventData,
  ConversationUnreadUpdatedEventData,
  ConversationUpdatedEventData,
} from './conversation.js';
import type { CLIENT_EVENTS, SERVER_EVENTS } from './event-names.js';
import type {
  FriendRequestAcceptedEventData,
  FriendRequestCancelledEventData,
  FriendRequestNewEventData,
  FriendRequestRejectedEventData,
} from './friend-request.js';
import type { LinkMessageNewEventData } from './link.js';
import type {
  LocationLiveStartData,
  LocationLiveStartedEventData,
  LocationLiveStopData,
  LocationLiveStoppedEventData,
  LocationLiveUpdateData,
  LocationLiveUpdatedEventData,
} from './location.js';
import type {
  MentionCreatedEventData,
  MessageConsumedEventData,
  MessageDeleteData,
  MessageDeletedEventData,
  MessageEditData,
  MessageHiddenForMeEventData,
  MessagePinnedEventData,
  MessageRestoredForMeEventData,
  MessageSendData,
  MessageSendResponseData,
  MessageSendWithAttachmentsData,
  MessageUnpinnedEventData,
  ReadStatusUpdatedEventData,
  SocketIOMessage,
} from './message.js';
import type {
  NotificationCountsEventData,
  NotificationDeletedBulkEventData,
  NotificationDeletedEventData,
  NotificationEventData,
  NotificationReadBulkEventData,
  NotificationReadEventData,
} from './notification.js';
import type {
  ConversationParticipantBannedEventData,
  ConversationParticipantJoinedEventData,
  ConversationParticipantLeftEventData,
  ConversationParticipantUnbannedEventData,
  ParticipantRightsUpdatedEventData,
  ParticipantRoleUpdatedEventData,
} from './participant.js';
import type {
  UserPreferencesCommunityReorderedEventData,
  UserPreferencesReorderedEventData,
  UserPreferencesUpdatedEventData,
} from './preferences.js';
import type {
  PresenceSnapshotEventData,
  TypingActionData,
  TypingEvent,
  UserStatusEvent,
} from './presence.js';
import type {
  AttachmentReactionUpdateEventData,
  ReactionAddData,
  ReactionRemoveData,
  ReactionSyncEventData,
  ReactionUpdateEventData,
} from './reaction.js';
import type {
  CommentReactionAddData,
  CommentReactionRemoveData,
  PostRoomActionData,
} from './social.js';
import type { SocketIOResponse } from './socket.js';
import type {
  RequestTranslationData,
  StoryTranslationUpdatedEventData,
  TranslationEvent,
} from './translation.js';
import type { UserUpdatedEventData } from './user.js';

// Événements du serveur vers le client
export interface ServerToClientEvents {
  [SERVER_EVENTS.MESSAGE_NEW]: (message: SocketIOMessage) => void;
  [SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED]: (data: AttachmentUpdatedEventData) => void;
  [SERVER_EVENTS.MESSAGE_EDITED]: (message: SocketIOMessage) => void;
  [SERVER_EVENTS.MESSAGE_DELETED]: (data: MessageDeletedEventData) => void;
  [SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME]: (data: MessageHiddenForMeEventData) => void;
  [SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME]: (data: MessageRestoredForMeEventData) => void;
  [SERVER_EVENTS.MESSAGE_TRANSLATION]: (data: TranslationEvent) => void;
  [SERVER_EVENTS.TYPING_START]: (data: TypingEvent) => void;
  [SERVER_EVENTS.TYPING_STOP]: (data: TypingEvent) => void;
  [SERVER_EVENTS.USER_STATUS]: (data: UserStatusEvent) => void;
  [SERVER_EVENTS.PRESENCE_SNAPSHOT]: (data: PresenceSnapshotEventData) => void;
  [SERVER_EVENTS.CONVERSATION_JOINED]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.CONVERSATION_LEFT]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.CONVERSATION_JOIN_ERROR]: (data: ConversationJoinErrorEventData) => void;
  [SERVER_EVENTS.AUTHENTICATED]: (data: AuthenticatedEventData) => void;
  [SERVER_EVENTS.AUTH_TOKEN_EXPIRED]: (data: AuthTokenExpiredEventData) => void;
  [SERVER_EVENTS.AUTH_SESSION_REVOKED]: (data: AuthSessionRevokedEventData) => void;
  [SERVER_EVENTS.ERROR]: (data: ErrorEventData) => void;
  [SERVER_EVENTS.CONVERSATION_STATS]: (data: ConversationStatsEventData) => void;
  [SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED]: (data: ConversationUnreadUpdatedEventData) => void;
  [SERVER_EVENTS.REACTION_ADDED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.REACTION_REMOVED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.ATTACHMENT_REACTION_ADDED]: (data: AttachmentReactionUpdateEventData) => void;
  [SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED]: (data: AttachmentReactionUpdateEventData) => void;
  [SERVER_EVENTS.CALL_INITIATED]: (data: CallInitiatedEvent) => void;
  [SERVER_EVENTS.CALL_PARTICIPANT_JOINED]: (data: CallParticipantJoinedEvent) => void;
  [SERVER_EVENTS.CALL_PARTICIPANT_LEFT]: (data: CallParticipantLeftEvent) => void;
  [SERVER_EVENTS.CALL_ENDED]: (data: CallEndedEvent) => void;
  [SERVER_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent) => void;
  [SERVER_EVENTS.CALL_MEDIA_TOGGLED]: (data: CallMediaToggleEvent) => void;
  [SERVER_EVENTS.CALL_ERROR]: (data: CallError) => void;
  [SERVER_EVENTS.CALL_MISSED]: (data: CallMissedEvent) => void;
  [SERVER_EVENTS.CALL_QUALITY_ALERT]: (data: CallQualityAlertEvent) => void;
  [SERVER_EVENTS.CALL_TRANSLATED_SEGMENT]: (data: CallTranslatedSegmentEvent) => void;
  [SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE]: (data: CallTranscriptionActiveBroadcast) => void;
  [SERVER_EVENTS.CALL_TRANSLATION_REQUESTED]: (data: CallTranslationRequestedEvent) => void;
  [SERVER_EVENTS.CALL_TRANSLATION_ENABLED]: (data: CallTranslationEnabledEvent) => void;
  [SERVER_EVENTS.CALL_TRANSCRIPTION_RESULT]: (data: CallTranscriptionResultEvent) => void;
  [SERVER_EVENTS.CALL_ALREADY_ANSWERED]: (data: CallAlreadyAnsweredEvent) => void;
  [SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT]: (data: CallScreenCaptureEvent) => void;
  [SERVER_EVENTS.CALL_FORCE_LEAVE]: (data: CallForceLeaveServerEvent) => void;
  [SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED]: (data: CallIceServersRefreshedEvent) => void;
  [SERVER_EVENTS.CONVERSATION_NEW]: (data: ConversationNewEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_CANCELLED]: (data: FriendRequestCancelledEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_NEW]: (data: FriendRequestNewEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED]: (data: FriendRequestAcceptedEventData) => void;
  [SERVER_EVENTS.FRIEND_REQUEST_REJECTED]: (data: FriendRequestRejectedEventData) => void;
  [SERVER_EVENTS.READ_STATUS_UPDATED]: (data: ReadStatusUpdatedEventData) => void;
  [SERVER_EVENTS.MESSAGE_CONSUMED]: (data: MessageConsumedEventData) => void;
  [SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED]: (data: ParticipantRoleUpdatedEventData) => void;
  [SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED]: (data: ParticipantRightsUpdatedEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATION_READY]: (data: AudioTranslationReadyEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE]: (data: AudioTranslationsProgressiveEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED]: (data: AudioTranslationsCompletedEventData) => void;
  [SERVER_EVENTS.TRANSCRIPTION_READY]: (data: TranscriptionReadyEventData) => void;
  [SERVER_EVENTS.TRANSLATION_FAILED]: (data: TranslationFailedEventData) => void;
  [SERVER_EVENTS.AUDIO_TRANSLATION_FAILED]: (data: AudioTranslationFailedEventData) => void;
  [SERVER_EVENTS.TRANSCRIPTION_FAILED]: (data: TranscriptionFailedEventData) => void;

  // Mentions
  [SERVER_EVENTS.MENTION_CREATED]: (data: MentionCreatedEventData) => void;

  // Message pinning
  [SERVER_EVENTS.MESSAGE_PINNED]: (data: MessagePinnedEventData) => void;
  [SERVER_EVENTS.MESSAGE_UNPINNED]: (data: MessageUnpinnedEventData) => void;

  // Location sharing
  [SERVER_EVENTS.LOCATION_LIVE_STARTED]: (data: LocationLiveStartedEventData) => void;
  [SERVER_EVENTS.LOCATION_LIVE_UPDATED]: (data: LocationLiveUpdatedEventData) => void;
  [SERVER_EVENTS.LOCATION_LIVE_STOPPED]: (data: LocationLiveStoppedEventData) => void;

  // Social / Posts
  [SERVER_EVENTS.POST_CREATED]: (data: PostCreatedEventData) => void;
  [SERVER_EVENTS.POST_UPDATED]: (data: PostUpdatedEventData) => void;
  [SERVER_EVENTS.POST_DELETED]: (data: PostDeletedEventData) => void;
  [SERVER_EVENTS.POST_LIKED]: (data: PostLikedEventData) => void;
  [SERVER_EVENTS.POST_UNLIKED]: (data: PostUnlikedEventData) => void;
  [SERVER_EVENTS.POST_REPOSTED]: (data: PostRepostedEventData) => void;
  [SERVER_EVENTS.POST_BOOKMARKED]: (data: PostBookmarkedEventData) => void;

  // Stories
  [SERVER_EVENTS.STORY_CREATED]: (data: StoryCreatedEventData) => void;
  [SERVER_EVENTS.STORY_UPDATED]: (data: StoryUpdatedEventData) => void;
  [SERVER_EVENTS.STORY_DELETED]: (data: StoryDeletedEventData) => void;
  [SERVER_EVENTS.STORY_VIEWED]: (data: StoryViewedEventData) => void;
  [SERVER_EVENTS.STORY_REACTED]: (data: StoryReactedEventData) => void;
  [SERVER_EVENTS.STORY_UNREACTED]: (data: StoryUnreactedEventData) => void;
  [SERVER_EVENTS.STORY_TRANSLATION_UPDATED]: (data: StoryTranslationUpdatedEventData) => void;

  // Moods/Statuses
  [SERVER_EVENTS.STATUS_CREATED]: (data: StatusCreatedEventData) => void;
  [SERVER_EVENTS.STATUS_UPDATED]: (data: StatusUpdatedEventData) => void;
  [SERVER_EVENTS.STATUS_DELETED]: (data: StatusDeletedEventData) => void;
  [SERVER_EVENTS.STATUS_REACTED]: (data: StatusReactedEventData) => void;
  [SERVER_EVENTS.STATUS_UNREACTED]: (data: StatusUnreactedEventData) => void;

  // Comments
  [SERVER_EVENTS.COMMENT_ADDED]: (data: CommentAddedEventData) => void;
  [SERVER_EVENTS.COMMENT_UPDATED]: (data: CommentUpdatedEventData) => void;
  [SERVER_EVENTS.COMMENT_DELETED]: (data: CommentDeletedEventData) => void;
  [SERVER_EVENTS.COMMENT_LIKED]: (data: CommentLikedEventData) => void;
  [SERVER_EVENTS.COMMENT_UNLIKED]: (data: CommentUnlikedEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_ADDED]: (data: CommentReactionUpdateEventData) => void;
  [SERVER_EVENTS.COMMENT_REACTION_REMOVED]: (data: CommentReactionUpdateEventData) => void;

  // Post reactions (Phase 3B)
  [SERVER_EVENTS.POST_REACTION_ADDED]: (data: PostReactionUpdateEventData) => void;
  [SERVER_EVENTS.POST_REACTION_REMOVED]: (data: PostReactionUpdateEventData) => void;

  // Post/Comment Translations
  [SERVER_EVENTS.POST_TRANSLATION_UPDATED]: (data: PostTranslationUpdatedEventData) => void;
  [SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED]: (data: CommentTranslationUpdatedEventData) => void;
  [SERVER_EVENTS.COMMENT_MEDIA_UPDATED]: (data: CommentMediaUpdatedEventData) => void;

  // User Preferences
  [SERVER_EVENTS.USER_PREFERENCES_UPDATED]: (data: UserPreferencesUpdatedEventData) => void;
  [SERVER_EVENTS.USER_PREFERENCES_REORDERED]: (data: UserPreferencesReorderedEventData) => void;
  [SERVER_EVENTS.USER_PREFERENCES_COMMUNITY_REORDERED]: (
    data: UserPreferencesCommunityReorderedEventData
  ) => void;

  // User Profile
  [SERVER_EVENTS.USER_UPDATED]: (data: UserUpdatedEventData) => void;

  // Conversation Categories
  [SERVER_EVENTS.CATEGORY_CREATED]: (data: CategoryCreatedEventData) => void;
  [SERVER_EVENTS.CATEGORY_UPDATED]: (data: CategoryUpdatedEventData) => void;
  [SERVER_EVENTS.CATEGORY_DELETED]: (data: CategoryDeletedEventData) => void;
  [SERVER_EVENTS.CATEGORIES_REORDERED]: (data: CategoriesReorderedEventData) => void;

  // Agent admin dashboard
  [SERVER_EVENTS.AGENT_ADMIN_EVENT]: (data: AgentAdminEventData) => void;

  // Notifications
  [SERVER_EVENTS.NOTIFICATION_NEW]: (data: NotificationEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_READ]: (data: NotificationReadEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_READ_BULK]: (data: NotificationReadBulkEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_DELETED_BULK]: (data: NotificationDeletedBulkEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_DELETED]: (data: NotificationDeletedEventData) => void;
  [SERVER_EVENTS.NOTIFICATION_COUNTS]: (data: NotificationCountsEventData) => void;

  // Delivery queue — includes affected conversationIds so clients can scope invalidation
  /**
   * Fin du rejeu de la file hors ligne, au reconnect.
   *
   * **Les deux champs ne portent PAS la même population, et c'est délibéré.**
   *
   * - `count` — le nombre d'entrées RÉELLEMENT rejouées. C'est une affirmation
   *   de livraison : elle ne compte jamais une entrée que la passerelle n'a pas
   *   su diffuser (`eventType` que la table `DRAINED_EVENT` ne résout pas, ou
   *   émission qui a levé). Même règle que les accusés de réception, qui
   *   descendent de la même liste.
   * - `conversationIds` — les conversations TOUCHÉES par le drain, rejeu réussi
   *   ou entrée perdue. Plus large que `count` par construction.
   *
   * L'écart entre les deux est ce qui rend une perte de rejeu RÉCUPÉRABLE. Le
   * drain est destructif : une entrée qu'on ne sait pas diffuser sort de la
   * file sans que rien n'atteigne le client. Les messages qu'elle transportait
   * sont pourtant toujours en base — seul leur rejeu temps réel a échoué. En
   * nommant quand même la conversation, l'événement envoie le client les
   * relire ; l'omettre ferait d'un incident de transport un trou permanent.
   *
   * Un `count: 0` accompagné d'une conversation nommée est donc une forme
   * VALIDE, et se lit « rien n'a pu être rejoué, va relire celle-ci ».
   */
  [SERVER_EVENTS.PENDING_MESSAGES_DELIVERED]: (data: { count: number; conversationIds: string[] }) => void;

  // Conversation lifecycle
  [SERVER_EVENTS.CONVERSATION_UPDATED]: (data: ConversationUpdatedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_CLOSED]: (data: ConversationClosedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_DELETED]: (data: ConversationDeletedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_RESTORED]: (data: ConversationRestoredEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED]: (data: ConversationParticipantJoinedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT]: (data: ConversationParticipantLeftEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED]: (data: ConversationParticipantBannedEventData) => void;
  [SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED]: (data: ConversationParticipantUnbannedEventData) => void;

  // Attachment status
  [SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED]: (data: AttachmentStatusUpdatedEventData) => void;

  // Share link messages
  [SERVER_EVENTS.LINK_MESSAGE_NEW]: (data: LinkMessageNewEventData) => void;

  // Connection health
  [SERVER_EVENTS.HEARTBEAT_ACK]: (data: HeartbeatAckEventData) => void;
}

// Événements du client vers le serveur
export interface ClientToServerEvents {
  [CLIENT_EVENTS.MESSAGE_SEND]: (data: MessageSendData, callback?: (response: SocketIOResponse<MessageSendResponseData>) => void) => void;
  [CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS]: (data: MessageSendWithAttachmentsData, callback?: (response: SocketIOResponse<MessageSendResponseData>) => void) => void;
  [CLIENT_EVENTS.MESSAGE_EDIT]: (data: MessageEditData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.MESSAGE_DELETE]: (data: MessageDeleteData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.CONVERSATION_JOIN]: (data: ConversationActionData) => void;
  [CLIENT_EVENTS.CONVERSATION_LEAVE]: (data: ConversationActionData) => void;
  [CLIENT_EVENTS.TYPING_START]: (data: TypingActionData) => void;
  [CLIENT_EVENTS.TYPING_STOP]: (data: TypingActionData) => void;
  [CLIENT_EVENTS.AUTHENTICATE]: (data: AuthenticateData) => void;
  [CLIENT_EVENTS.REQUEST_TRANSLATION]: (data: RequestTranslationData) => void;
  /**
   * L'accusé de réception d'un `reaction:add` porte la LIGNE PERSISTÉE
   * (`ReactionData`), et non l'`ReactionUpdateEventData` du broadcast.
   *
   * Ce n'est pas un relâchement du contrat, c'est ce que cet accusé PEUT tenir.
   * `ReactionUpdateEventData` porte une `aggregation`, qui ne s'obtient qu'au
   * prix de deux lectures supplémentaires APRÈS la persistance
   * (`message.findUnique` puis `createUpdateEvent`). Or ce handler acquitte
   * délibérément dès la persistance : une défaillance transitoire de ces
   * lectures ne doit jamais retourner l'accusé en échec, sans quoi le client
   * annule une réaction déjà écrite en base. Déclarer l'agrégation ici, c'est
   * réclamer un champ que le seul émetteur ne peut produire sans abandonner
   * cette garantie de livraison — et c'est exactement pourquoi il ne l'a jamais
   * produit.
   *
   * Les familles COMMENTAIRE et POST déclarent, elles, leur `updateEvent`
   * (`comment:reaction-*`, `post:reaction-*`) : leurs handlers acquittent APRÈS
   * l'agrégation, et l'iOS décode ces accusés. Les trois familles ne sont donc
   * pas interchangeables — chacune déclare ce que SON émetteur envoie.
   *
   * Historique : la forme opaque (`SocketIOResponse<unknown>` côté handler) a
   * déjà coûté trois incidents de décodage à l'iOS — deux `malformedResponse`
   * sur les accusés post/commentaire, un `DecodingError` sur le REST
   * `/reactions` (d'où `DiscardedReactionResponse`). Le quatrième site est
   * celui-ci ; il est fermé par la déclaration, et par le fait que les
   * handlers prennent désormais CE type et non plus `unknown`.
   */
  [CLIENT_EVENTS.REACTION_ADD]: (data: ReactionAddData, callback?: (response: SocketIOResponse<ReactionData>) => void) => void;
  /**
   * Un retrait ne laisse RIEN derrière lui qui mérite le fil : `data` est
   * absent, et `never` le rend inexprimable plutôt que simplement vide.
   *
   * L'émetteur envoyait `{ message: 'Reaction removed successfully' }` et
   * `{ message: 'Reaction already absent' }` — deux phrases anglaises non
   * localisées, qu'aucun des trois clients ne lit (le web n'inspecte que
   * `success`/`error`, l'iOS passe par le REST, Android n'émet pas cet
   * événement). Dans un produit dont la promesse est de traduire tout le
   * contenu, un texte anglais en dur sur le fil est un piège pour le premier
   * client qui l'affichera.
   */
  [CLIENT_EVENTS.REACTION_REMOVE]: (data: ReactionRemoveData, callback?: (response: SocketIOResponse<never>) => void) => void;
  /**
   * La QUATRIÈME famille de réactions, et la seule qui ait toujours eu raison :
   * son handler acquitte `{ success: true }` sur TOUS ses chemins — nominal
   * comme idempotent — et laisse l'`AttachmentReactionUpdateEventData` voyager
   * sur la diffusion, qui est son seul lecteur.
   *
   * `never` grave ce qu'elle fait déjà. Il ne remplace pas `unknown` pour la
   * forme : `unknown` accepte TOUTE charge, donc n'aurait pas empêché ce site
   * de dériver vers la ligne brute ou la phrase anglaise que portaient les
   * trois autres — c'est exactement l'opacité qui les a laissées diverger.
   */
  [CLIENT_EVENTS.ATTACHMENT_REACTION_ADD]: (data: { attachmentId: string; messageId: string; emoji: string }, callback?: (response: SocketIOResponse<never>) => void) => void;
  [CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE]: (data: { attachmentId: string; messageId: string; emoji: string }, callback?: (response: SocketIOResponse<never>) => void) => void;
  [CLIENT_EVENTS.REACTION_REQUEST_SYNC]: (messageId: string, callback?: (response: SocketIOResponse<ReactionSyncEventData>) => void) => void;
  // Les quatre `ack?` ci-dessous — INITIATE, JOIN, SIGNAL, END — étaient les
  // seuls acks REQUIS de tout le contrat (4 contre 18 optionnels). Ils
  // promettaient une chose qu'aucune des deux moitiés du fil ne tient :
  //
  //   - la passerelle déclare les QUATRE `ack?` et les appelle toutes en
  //     `ack?.(…)` (`CallEventsHandler.ts` 2453 / 2776 / 3487 / 3851) : elle est
  //     écrite pour fonctionner quand il n'y en a pas ;
  //   - et des émetteurs réels n'en envoient pas — les trois `call:end` du web,
  //     `call:join` et `call:signal` d'iOS (`MessageSocketManager.swift` 2898 /
  //     3037 / 3077 / 3086), tandis que d'autres sites du MÊME fichier iOS
  //     utilisent `emitWithAck` : l'ack est optionnel PAR CONCEPTION.
  //
  // Le prix du mensonge se lisait dans le code appelant : les quatre émissions
  // `call:signal` du web fabriquent un `() => {}` VIDE (`use-webrtc-p2p.ts` 290
  // / 329 / 674 / 761) pour satisfaire un paramètre requis que le serveur
  // n'exige pas — une cérémonie qui coûte un paquet d'ACK par candidat ICE.
  // Là où le contrat n'était pas contourné par une cérémonie, il l'était par un
  // cast : les trois `call:end` du web passent par `(socket as unknown).emit`.
  //
  // Un contrat que tout site d'appel doit contourner pour dire la vérité ne
  // gouverne plus rien. Cf. le cliquet `_CallAcksAreOptional` sous l'interface.
  [CLIENT_EVENTS.CALL_INITIATE]: (data: CallInitiateEvent, ack?: (response: CallInitiateAck) => void) => void;
  [CLIENT_EVENTS.CALL_JOIN]: (data: CallJoinEvent, ack?: (response: CallJoinAck) => void) => void;
  [CLIENT_EVENTS.CALL_LEAVE]: (data: { callId: string }) => void;
  [CLIENT_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent, ack?: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_AUDIO]: (data: CallMediaToggleClientEvent) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_VIDEO]: (data: CallMediaToggleClientEvent) => void;
  /**
   * L'ack est OPTIONNEL, et il l'est dans l'autre sens que celui de
   * `CallMediaToggleClientEvent` (cycle 107 bis) — même symptôme, résolution
   * inverse, parce que la mesure diffère.
   *
   * Là-bas l'ack a été RETIRÉ : aucun client ne l'envoyait, la passerelle ne
   * l'appelait jamais, le déclarer était une promesse creuse. Ici il est REL :
   * la passerelle l'invoque à chacune de ses sorties (`ack?.({ success })`,
   * `CallEventsHandler` `CALL_EVENTS.END`) et iOS s'en sert par ses variantes
   * `emitWithAck` (`MessageSocketManager.swift`). Mais elle le déclare `ack?:`
   * et fonctionne sans, ce dont dépendent les émetteurs SANS ack : iOS
   * (`emit("call:end", …)`), Android (`CallSignalManager.kt`) et les trois
   * sites web.
   *
   * Le déclarer REQUIS interdisait donc le motif majoritaire que la passerelle
   * soutient explicitement. Un contrat suit ce qui est, pas ce qu'on préfère.
   */
  [CLIENT_EVENTS.CALL_END]: (data: { callId: string; reason?: string }, ack?: (response: { success: boolean }) => void) => void;
  [CLIENT_EVENTS.CALL_HEARTBEAT]: (data: CallHeartbeatEvent) => void;
  [CLIENT_EVENTS.CALL_QUALITY_REPORT]: (data: CallQualityReportEvent) => void;
  [CLIENT_EVENTS.CALL_RECONNECTING]: (data: CallReconnectingEvent) => void;
  [CLIENT_EVENTS.CALL_RECONNECTED]: (data: CallReconnectedEvent) => void;
  [CLIENT_EVENTS.CALL_BACKGROUNDED]: (data: { callId: string; participantId: string }) => void;
  [CLIENT_EVENTS.CALL_FOREGROUNDED]: (data: { callId: string; participantId: string }) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT]: (data: CallTranscriptionSegmentEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE]: (data: CallTranscriptionActiveEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_CAPABILITY]: (data: CallTranscriptionCapabilityEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSCRIPTION_ROLE]: (data: CallTranscriptionRoleEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSLATION_REQUEST]: (data: CallTranslationRequestEvent) => void;
  [CLIENT_EVENTS.CALL_TRANSLATION_RESPONSE]: (data: CallTranslationResponseEvent) => void;
  [CLIENT_EVENTS.CALL_AUDIO_CHUNK]: (data: CallAudioChunkEvent) => void;
  [CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]: (data: CallQualityFeedbackEvent) => void;
  [CLIENT_EVENTS.CALL_SCREEN_CAPTURE_DETECTED]: (data: CallScreenCaptureEvent) => void;
  [CLIENT_EVENTS.CALL_FORCE_LEAVE]: (data: CallForceLeaveClientEvent) => void;
  [CLIENT_EVENTS.CALL_CHECK_ACTIVE]: () => void;
  [CLIENT_EVENTS.CALL_REQUEST_ICE_SERVERS]: (data: CallRequestIceServersEvent) => void;
  [CLIENT_EVENTS.CALL_ANALYTICS]: (data: CallAnalyticsEvent) => void;
  [CLIENT_EVENTS.PRESENCE_APP_STATE]: (data: { foreground?: boolean }) => void;

  // Location sharing
  [CLIENT_EVENTS.LOCATION_LIVE_START]: (data: LocationLiveStartData, callback?: (response: SocketIOResponse<LocationLiveStartedEventData>) => void) => void;
  [CLIENT_EVENTS.LOCATION_LIVE_UPDATE]: (data: LocationLiveUpdateData) => void;
  [CLIENT_EVENTS.LOCATION_LIVE_STOP]: (data: LocationLiveStopData) => void;

  // Feed subscription
  [CLIENT_EVENTS.FEED_SUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.FEED_UNSUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;

  // Post room membership
  [CLIENT_EVENTS.JOIN_POST]: (data: PostRoomActionData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.LEAVE_POST]: (data: PostRoomActionData, callback?: (response: SocketIOResponse) => void) => void;

  // Comment reactions
  [CLIENT_EVENTS.COMMENT_REACTION_ADD]: (data: CommentReactionAddData, callback?: (response: SocketIOResponse<CommentReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.COMMENT_REACTION_REMOVE]: (data: CommentReactionRemoveData, callback?: (response: SocketIOResponse<CommentReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.COMMENT_REACTION_REQUEST_SYNC]: (data: { commentId: string }, callback?: (response: SocketIOResponse<CommentReactionSyncEventData>) => void) => void;

  // Post reactions (Phase 3B)
  [CLIENT_EVENTS.POST_REACTION_ADD]: (data: PostReactionAddData, callback?: (response: SocketIOResponse<PostReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.POST_REACTION_REMOVE]: (data: PostReactionRemoveData, callback?: (response: SocketIOResponse<PostReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.POST_REACTION_REQUEST_SYNC]: (data: { postId: string }, callback?: (response: SocketIOResponse<PostReactionSyncEventData>) => void) => void;

  // Presence — optionally carries clientTime (ms since epoch) for RTT measurement
  [CLIENT_EVENTS.HEARTBEAT]: (data?: { clientTime?: number }) => void;

  // Agent admin dashboard
  [CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.ADMIN_AGENT_UNSUBSCRIBE]: (callback?: (response: SocketIOResponse) => void) => void;
}

/**
 * Le type de l'accusé de réception d'un événement client, LU SUR LE CONTRAT.
 *
 * Un handler de la passerelle qui écrit `callback?: (r: SocketIOResponse<X>) =>
 * void` de sa main REDÉCLARE ce que cette interface déclare déjà, et les deux
 * peuvent alors diverger sans que rien ne l'empêche — c'est précisément ce qui
 * s'est produit sur les trois familles de réactions, où les handlers portaient
 * `SocketIOResponse<unknown>` pendant que le contrat promettait une charge
 * précise. `unknown` accepte tout : aucune des deux moitiés du fil ne vérifiait
 * l'autre, et le désaccord a coûté trois incidents de décodage à l'iOS.
 *
 * `AckOf<'reaction:add'>` n'est pas une COPIE du contrat, c'est une LECTURE :
 * il n'existe plus qu'une seule déclaration, et changer la charge d'un accusé
 * fait rougir tous ses `callback(...)` au lieu de les laisser passer.
 *
 * Le `NonNullable` retire l'optionalité du paramètre (`callback?`) sans toucher
 * à la charge ; l'appel reste facultatif côté handler, c'est sa SIGNATURE qui
 * cesse de l'être.
 */
export type AckOf<E extends keyof ClientToServerEvents> =
  NonNullable<Parameters<ClientToServerEvents[E]>[1]>;

/**
 * La RÉPONSE que cet accusé transporte — `Parameters<AckOf<E>>[0]`.
 *
 * Les handlers construisent souvent la réponse dans une variable locale avant
 * de l'acquitter (`const successResponse: … = { … }; callback(successResponse)`).
 * Annotée `SocketIOResponse<unknown>`, cette locale rouvrait la porte que la
 * signature venait de fermer : elle accepte n'importe quelle charge, et le
 * `callback(successResponse)` qui suit ne compare plus rien au contrat.
 * `AckResponseOf<E>` la referme au même endroit et depuis la même source.
 */
export type AckResponseOf<E extends keyof ClientToServerEvents> =
  Parameters<AckOf<E>>[0];

/* ------------------------------------------------------------------------- *
 * Le cliquet des acks d'appel — au TYPE, sans une ligne exécutable.
 *
 * Même emplacement et même raison que ses jumeaux de la passerelle
 * (`socketio/serverEmit.ts`, `socketio/clientReceive.ts`) : les tests sont
 * exclus du `tsconfig` et l'`ignoreCodes` de `ts-jest` couvre `2322`/`2345`, si
 * bien que **la production est le seul endroit d'où un cliquet de type peut
 * mordre**. Ici, en plus, `packages/shared` type-check en BLOQUANT dans la CI.
 *
 * Ce cliquet garde une propriété que rien d'autre ne peut garder : rendre l'un
 * de ces acks à nouveau REQUIS casse la compilation ICI, à l'endroit où la
 * mesure est écrite, plutôt que chez le prochain appelant qui contournera par
 * un `() => {}` vide ou par un cast.
 *
 * EXPORTÉS, contrairement à leurs jumeaux de la passerelle : `packages/shared`
 * compile avec `noUnusedLocals`, qui refuse un alias de type local jamais
 * référencé. L'export est donc la façon de garder le cliquet ADJACENT à ce
 * qu'il garde — l'emplacement fait la moitié de son travail. Types purs, donc
 * effacés à l'exécution ; leur présence dans la surface publique ne coûte rien.
 * ------------------------------------------------------------------------- */

/** Échoue à compiler dès que `T` n'est plus `true`. */
type AssertContract<T extends true> = T;

/**
 * Émettre ces quatre événements avec la CHARGE SEULE est permis par le contrat.
 *
 * `Parameters<…>` d'un ack REQUIS est un tuple de longueur 2, auquel un tuple
 * de longueur 1 n'est pas assignable — c'est exactement l'erreur (`TS2554`,
 * « Expected 2 arguments, but got 1 ») que les sites d'appel contournaient.
 * Avec `ack?`, le tuple devient `[data, ack?]` et la ligne passe.
 *
 * Le cas ci-dessous est le plus fort des quatre : `call:end` est émis SANS ack
 * par cinq des sept émetteurs du dépôt (trois web, deux iOS).
 */
export type _CallAcksAreOptional = AssertContract<
  [
    [CallInitiateEvent] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_INITIATE]> ? true : false,
    [CallJoinEvent] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_JOIN]> ? true : false,
    [CallSignalEvent] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_SIGNAL]> ? true : false,
    [{ callId: string }] extends Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_END]> ? true : false,
  ] extends [true, true, true, true] ? true : false
>;

/**
 * Le témoin NÉGATIF, sans lequel le précédent ne prouve rien : un ack requis
 * REFUSE bien la charge seule. Sans cette ligne, un `Parameters<…>` qui
 * rendrait `any` (ou une refonte qui rendrait l'assignabilité toujours vraie)
 * laisserait `_CallAcksAreOptional` passer pour un cliquet qui garde quelque
 * chose. Un témoin qu'on n'a pas vu échouer n'est pas un témoin.
 */
export type _RequiredAckWouldRefusePayloadAlone = AssertContract<
  [{ callId: string }] extends Parameters<(data: { callId: string }, ack: () => void) => void> ? false : true
>;

// Export des interfaces principales
export type {
  ServerToClientEvents as SocketIOServerEvents,
  ClientToServerEvents as SocketIOClientEvents
};
