/**
 * Gestionnaire Socket.IO pour Meeshy
 * Gestion des connexions, conversations et traductions en temps réel
 */

import { Server as SocketIOServer } from 'socket.io';
// Cycle 107 — le `Socket` vient du contrat, pas de `socket.io`. Ce module
// CONSTRUIT le serveur (d'où l'import de `Server` ci-dessus, immédiatement
// paramétré par les deux cartes du contrat), mais il ÉCOUTE comme les autres :
// ses paramètres de socket n'ont aucune raison d'être plus permissifs que ceux
// des six handlers qui dérivent déjà les leurs.
import type { MeeshySocket as Socket } from './typed-socket';
import { Server as HTTPServer } from 'http';
import { PrismaClient, UserRole } from '@meeshy/shared/prisma/client';
import { MessageTranslationService, MessageData } from '../services/message-translation/MessageTranslationService';
import { isMessageTranslationTarget } from '../services/zmq-translation/utils/zmq-helpers';
import { transformTranslationsToArray } from '../utils/translation-transformer';
import { filterMessagePayloadForLanguages, groupSocketsByLanguage } from './utils/message-payload-filter';
import { applyResolvedLanguagesRefresh } from './utils/resolved-languages-refresh';
import { MaintenanceService } from '../services/MaintenanceService';
import { disconnectRevokedSessions } from './disconnectRevokedSessions';
import { StatusService } from '../services/StatusService';
import { MessagingService } from '../services/MessagingService';
import { CallEventsHandler } from './CallEventsHandler';
import { SocialEventsHandler } from './handlers/SocialEventsHandler';
import { LocationHandler } from './handlers/LocationHandler';
import { sharedPlaceFromMetadata, hoistLocationOnto } from '../services/location/sharedPlace';
import { AuthHandler } from './handlers/AuthHandler';
import { MessageHandler } from './handlers/MessageHandler';
import { StatusHandler } from './handlers/StatusHandler';
import { ReactionHandler } from './handlers/ReactionHandler';
import { AttachmentReactionHandler } from './handlers/AttachmentReactionHandler';
import { AttachmentReactionService } from '../services/AttachmentReactionService';
import { CommentReactionHandler } from './handlers/CommentReactionHandler';
import { PostReactionHandler } from './handlers/PostReactionHandler';
import { ConversationHandler } from './handlers/ConversationHandler';
import { AdminAgentHandler } from './handlers/AdminAgentHandler';
import { AgentAdminRelay } from './AgentAdminRelay';
import { CallService } from '../services/CallService';
import { AttachmentService } from '../services/attachments';
import { attachmentMediaSelect } from '../services/attachments/attachmentIncludes';
import { emitAttachmentUpdated } from './emitAttachmentUpdated';
import { buildTranslationEvent } from './buildTranslationEvent';
import { enqueueOfflineReactionEvent, type ReactionOfflineQueueParams } from './reactionOfflineQueue';
import { enqueueForOfflineParticipants, type OfflineParticipantQueueParams } from './offlineParticipantQueue';
import { emitUnreadCountsToRecipients } from './emitUnreadCountsToRecipients';
import { bridgeComputed, bridgeNotComputed } from './unreadBridgeField.js';
import { stripClientMessageId } from './utils/message-ack-shaping.js';
import {
  emitToConversationParticipants,
  participantUserRoomTargets,
  type ParticipantRoomTarget,
} from './emitToConversationParticipants';
import { presenceStatusEmissions } from './presence-audience';
import {
  PREVIEW_PRISM_PARTICIPANT_SELECT,
  resolveLastMessagePreviewPrism,
  toIsoOrNull,
  type PreviewPrismParticipant,
} from './utils/lastMessagePreviewPrism';
import { ReactionService } from '../services/ReactionService.js';
import { CommentReactionService } from '../services/CommentReactionService';
import { PostReactionService } from '../services/PostReactionService';
import { MessageReadStatusService } from '../services/MessageReadStatusService.js';
import { ConversationBridgeService } from '../services/ConversationBridgeService';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { EmailService } from '../services/EmailService';
import { PushNotificationService } from '../services/PushNotificationService';
import { NotificationService } from '../services/notifications/NotificationService';
import { setSharedNotificationService } from '../services/notifications/notification-service-registry';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService';
import { getBlockRelatedUserIds } from '../utils/blocking';
import { PresenceVisibilityService, type PresenceViewer } from '../services/PresenceVisibilityService';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { PostAudioService } from '../services/posts/PostAudioService';
import { PostTranslationService } from '../services/posts/PostTranslationService';
import { StoryTextObjectTranslationService } from '../services/posts/StoryTextObjectTranslationService';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketIOResponse,
  TranslationEvent,
  MessageType,
  TranslationFailedEventData,
  AudioTranslationFailedEventData,
  TranscriptionFailedEventData,
  AudioTranslationEventData,
} from '@meeshy/shared/types/socketio-events';
import { CLIENT_EVENTS, SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../services/ConversationStatsService';
import type { Message } from '@meeshy/shared/types/index';
import { buildMessageNewPayload } from './messageNewPayload';
import { buildMessageEditedCore, resolveWireSenderId } from './messageEditedPayload';
import { enhancedLogger } from '../utils/logger-enhanced';
import { BoundedTtlCache } from '../utils/bounded-cache';
import type { ZmqAgentClient } from '../services/zmq-agent/ZmqAgentClient';
import { MentionService, resolveUsernamesToIds } from '../services/MentionService';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import { emitConversationPreviewUpdate } from './emitConversationPreviewUpdate';
import { linkMessageEmissions, type SocketEmission } from './linkMessageEmissions';
import { emitServerEvent, type ServerEventName } from './serverEmit';
import { announcesMessageArrival } from './queuedMessageArrival';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import type { QueuedPayloadFor, QueuedVariantFor } from './queuedEventContract';
import { drainedEventName, isAddressableConversationId, isDeliverableQueuedPayload } from './queuedEventContract';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';

// Logger dédié pour SocketIOManager
const logger = enhancedLogger.child({ module: 'SocketIOManager' });

/**
 * Combien de conversations au plus reçoivent leur pont ✦ dans l'instantané de
 * reconnexion (`_emitUnreadCountsSnapshot`).
 *
 * 30 — la taille de page par DÉFAUT de `GET /conversations`, délibérément, et
 * pas un chiffre rond choisi au jugé : le pont ne se voit que sur une ligne
 * affichée, et la première page est ce que le lecteur a sous les yeux quand le
 * réseau revient. Le COMPTEUR, lui, n'est jamais borné — il part pour toutes
 * les conversations du lecteur, comme avant.
 */
const BRIDGE_SNAPSHOT_LIMIT = 30;

/**
 * Les rôles que la directive du 2026-08-25 tient pour privilégiés sur la
 * présence (« ADMIN et supérieur »), ÉNUMÉRÉS en croisant les rôles du SCHÉMA
 * avec la loi partagée, au lieu d'être recopiés à la main.
 *
 * `['ADMIN', 'BIGBOSS']` écrit en dur serait juste aujourd'hui et faux le jour
 * où `isGlobalAdmin` change d'avis — sans qu'aucun témoin ne rougisse, puisque
 * les deux listes vivraient dans des fichiers différents. Ici la liste ne peut
 * pas diverger : elle EST le filtre, appliqué aux valeurs que la colonne
 * `User.role` peut réellement porter.
 */
const PRESENCE_PRIVILEGED_ROLES = Object.values(UserRole).filter(isGlobalAdmin);


// What one queued entry actually puts on the wire. Every eventType replays as a
// single event EXCEPT 'link-message', which owes the same two events the live
// room emit owes — see `linkMessageEmissions`. A recipient who was offline when
// a share-link guest wrote is precisely the one this had to reach: the live
// emit had already gone out without them.
//
// La charge sort de Redis en `Record<string, unknown>` : c'est une frontière de
// DÉSÉRIALISATION, et le rattachement au contrat s'y affirme, comme dans
// `linkMessageEmissions`.
//
// Ce que le cycle 106 a changé, c'est l'autre bout. L'ENFILAGE est désormais
// vérifié : `queuedEventContract.ts` dérive de `DRAINED_EVENT` la charge que
// chaque `eventType` doit porter, et les huit écrivains y sont tenus. Un
// transport ne peut donc plus diffuser une forme et en enfiler une autre — la
// divergence n'aurait eu pour témoin qu'un destinataire hors ligne au mauvais
// moment, c'est-à-dire personne.
//
// Ce qui restait une AFFIRMATION sans validation à l'exécution — que l'octet
// relu de Redis soit bien ce qu'on y a écrit — est désormais VÉRIFIÉ pour la
// seule chose dont dépend l'adressage : le NOM de l'événement. Le typage borne
// toujours ce qu'on ÉCRIT et non ce qu'on RELIT ; la différence est qu'une
// entrée qu'on ne sait pas nommer se déclare maintenant indélivrable au lieu de
// partir sous un nom absent.
//
// Une liste VIDE dit « je ne sais pas diffuser ceci ». C'est la seule réponse
// honnête : `emit(undefined, payload)` ne lève pas (mesuré, socket.io 4.8), il
// diffuse un événement anonyme que nul n'écoute — et le drain étant DESTRUCTIF,
// le message est alors perdu sans recours et sans trace. L'appelant décide de
// la suite (journal, exclusion des accusés) ; ce n'est pas à la frontière de
// désérialisation de le faire.
function _drainedEmissions(entry: QueuedMessagePayload): SocketEmission[] {
  if (entry.eventType === 'link-message') return linkMessageEmissions(entry.payload);
  const event = drainedEventName(entry.eventType);
  if (event === undefined) return [];
  return [{ event, payload: entry.payload } as SocketEmission];
}

export interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
  /**
   * Ordered list of languages this socket can consume, derived from
   * resolveUserLanguagesOrdered() at connection time.
   * Priority: systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale.
   * Empty for anonymous users (they use `language` only).
   */
  resolvedLanguages: string[];
  /** For anonymous participants: the participant.id */
  participantId?: string;
  /** For registered users: the user.id */
  userId?: string;
  /** Display name resolved at connection time */
  displayName?: string;
  /** @deprecated kept for backward compat — raw session token */
  sessionToken?: string;
}

export interface TranslationNotification {
  messageId: string;
  translatedText: string;
  targetLanguage: string;
  confidenceScore: number;
}

export class MeeshySocketIOManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

  /// Exposes the underlying Socket.IO server. Used by background services
  /// (e.g. CallCleanupService) that need to broadcast events without going
  /// through the per-socket handler path.
  getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
    return this.io;
  }

  /// RC-4 — exposes the shared CallService instance so CallCleanupService's
  /// heartbeat GC tier observes the same in-memory heartbeat/ringing-timeout
  /// state that CallEventsHandler and AuthHandler write to, instead of an
  /// unwired second instance that always looks empty.
  getCallService(): CallService {
    return this.callService;
  }

  /// Exposes the shared CallEventsHandler so CallCleanupService's GC tiers
  /// can post the call-summary system message on calls they force-end —
  /// mirrors `getCallService()` above.
  getCallEventsHandler(): CallEventsHandler {
    return this.callEventsHandler;
  }

  private prisma: PrismaClient;
  private translationService: MessageTranslationService;
  private maintenanceService: MaintenanceService;
  private statusService: StatusService;
  private messagingService: MessagingService;
  private callEventsHandler: CallEventsHandler;
  private callService: CallService;
  private notificationService: NotificationService;
  private socialEventsHandler: SocialEventsHandler;
  private locationHandler: LocationHandler;
  private privacyPreferencesService: PrivacyPreferencesService;
  private presenceVisibilityService: PresenceVisibilityService;
  private agentClient: ZmqAgentClient | null = null;
  private mentionService: MentionService;
  private deliveryQueue: RedisDeliveryQueue | null = null;
  private readStatusService!: MessageReadStatusService;
  // Le pont ✦ (G-123) — même discipline que `readStatusService` : une seule
  // instance, sans état, réutilisée par les trois transports d'envoi.
  private bridgeService!: ConversationBridgeService;

  private authHandler!: AuthHandler;
  private messageHandler!: MessageHandler;
  private statusHandler!: StatusHandler;
  private reactionHandler!: ReactionHandler;
  private attachmentReactionHandler!: AttachmentReactionHandler;
  private commentReactionHandler!: CommentReactionHandler;
  private postReactionHandler!: PostReactionHandler;
  private conversationHandler!: ConversationHandler;
  private adminAgentHandler!: AdminAgentHandler;
  private agentAdminRelay: AgentAdminRelay | null = null;

  // Mapping des utilisateurs connectés
  private connectedUsers: Map<string, SocketUser> = new Map();
  private socketToUser: Map<string, string> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();

  // Rate limiter in-memory par socket (clé → timestamps des requêtes)
  private socketRateLimits: Map<string, number[]> = new Map();

  // Cache immutable identifier → ObjectId (populated on first lookup, bounded to 2000 entries FIFO)
  private readonly CONVERSATION_ID_CACHE_MAX = 2000;
  private conversationIdCache = new BoundedTtlCache<string, string>({ maxSize: this.CONVERSATION_ID_CACHE_MAX });

  // Cache presence snapshot par userId — évite 2 queries Prisma par reconnexion (TTL 60s)
  private presenceSnapshotCache = new Map<string, { users: Array<{ userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }>; cachedAt: number }>();
  private readonly PRESENCE_SNAPSHOT_CACHE_TTL_MS = 60_000;

  // Les `User.id` des ADMIN/BIGBOSS — l'audience PRIVILÉGIÉE de chaque
  // transition de présence (directive 2026-08-25). Mise en cache pour la même
  // raison que l'instantané ci-dessus : `_broadcastUserStatus` s'exécute à
  // CHAQUE connexion, chaque déconnexion, et pour chaque compte que le balayage
  // de maintenance passe hors ligne d'un coup. La requête est bornée par le
  // nombre d'administrateurs (une poignée), jamais par la population connectée.
  private globalAdminIdsCache: { ids: string[]; cachedAt: number } | null = null;
  private readonly GLOBAL_ADMIN_IDS_CACHE_TTL_MS = 60_000;

  // Statistiques
  private stats = {
    total_connections: 0,
    active_connections: 0,
    messages_processed: 0,
    translations_sent: 0,
    errors: 0
  };

  constructor(
    httpServer: HTTPServer,
    prisma: PrismaClient,
    translationService: MessageTranslationService
  ) {
    this.prisma = prisma;
    this.translationService = translationService;

    // Créer l'AttachmentService pour le cleanup automatique
    const attachmentService = new AttachmentService(prisma);
    const emailService = new EmailService();
    this.maintenanceService = new MaintenanceService(prisma, attachmentService, emailService);

    // Initialiser StatusService pour throttling des updates lastActiveAt
    this.statusService = new StatusService(prisma);

    // Initialiser PrivacyPreferencesService pour vérifier les préférences de confidentialité
    this.privacyPreferencesService = new PrivacyPreferencesService(prisma);

    // La loi de visibilité de la présence (amitié acceptée / ADMIN+ / blocage /
    // préférences) vit dans UN service, partagé avec les routes REST. Il reçoit
    // l'instance de préférences du gestionnaire pour que le cache de prefs soit
    // le MÊME des deux côtés du transport.
    this.presenceVisibilityService = new PresenceVisibilityService(prisma, this.privacyPreferencesService);

    // CORRECTION: Créer NotificationService AVANT MessagingService pour que les mentions génèrent des notifications
    this.notificationService = new NotificationService(prisma);
    // Cette instance est LA vivante du processus (elle recevra `io` via
    // setSocketIO) : l'enregistrer pour que les cascades hors-manager
    // (MessageReadStatusService…) émettent réellement sur le socket au lieu
    // d'instancier un doublon muet sans io.
    setSharedNotificationService(this.notificationService);
    this.mentionService = new MentionService(prisma);
    this.messagingService = new MessagingService(prisma, this.translationService, this.notificationService);
    // RC-4 — construct the shared CallService BEFORE CallEventsHandler so both
    // it and AuthHandler observe the same in-memory ringingTimeouts/heartbeats/
    // backgroundedParticipants maps (previously two independent instances,
    // silently desyncing disconnect-cleanup from the ringing-timeout/heartbeat
    // state actually being written by the socket handlers).
    this.callService = new CallService(prisma);
    this.callEventsHandler = new CallEventsHandler(prisma, this.callService);
    // P3 — let the call handler post the call-summary system message through
    // the canonical message broadcast path when a call ends.
    this.callEventsHandler.setMessageBroadcaster(
      (message, conversationId) => this.broadcastMessage(message as Message, conversationId)
    );
    // Live-call message — let the terminal upsert EDIT the live message
    // in-place (message:edited full payload + preview + offline enqueue).
    this.callEventsHandler.setMessageUpdateBroadcaster(
      (message, conversationId) => this.broadcastMessageEdited(message as Message, conversationId)
    );

    // CORRECTION: Configurer le callback de broadcast pour le MaintenanceService
    this.maintenanceService.setStatusBroadcastCallback(
      (userId: string, isOnline: boolean, isAnonymous: boolean) => {
        this._broadcastUserStatus(userId, isOnline, isAnonymous);
      }
    );

    // PRÉSENCE FIX: protéger les sockets vivants du cleanup périodique.
    // Sans ça, un client passif (pas de heartbeat depuis 30min) se voit marqué
    // offline par `updateOfflineUsers`, broadcastant un faux `isOnline: false`.
    this.maintenanceService.setIsCurrentlyConnected(
      (userId: string, _isAnonymous: boolean) => this.connectedUsers.has(userId)
    );

    // Le balayage journalier des demandes de suppression (`processAccountDeletionRequests`)
    // met des comptes HORS SERVICE (`isActive: false`) : leurs sockets encore vivants
    // recevraient leurs fils et émettraient `typing:start` (= « en ligne » chez les
    // clients). Seul le manager tient `io` : il fournit le révocateur, résolu à
    // l'appel (`this.io` naît quelques lignes plus bas). Même mécanisme que
    // `revoke-all-sessions` et que la désactivation par un admin (`routes/admin`).
    this.maintenanceService.setSessionRevoker((userId: string) =>
      disconnectRevokedSessions({
        io: this.io,
        userId,
        reason: 'logout_all_devices',
        message: 'Your account was deleted — every session was signed out.',
        onError: (err: unknown) => logger.warn('[MAINTENANCE] socket fanout failed on grace-period expiry', { err, userId }),
      })
    );

    // Initialiser Socket.IO avec les types shared
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      cors: {
        origin: process.env.NODE_ENV === 'development' ? true : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
          const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || 
                                 process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || 
                                 ['https://meeshy.me', 'https://www.meeshy.me', 'https://gate.meeshy.me', 'https://ml.meeshy.me'];
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ["GET", "POST"],
        allowedHeaders: ['authorization', 'content-type', 'x-session-token', 'websocket', 'polling'],
        credentials: true
      },
      // CORRECTION CRITIQUE: Configuration timeouts pour détecter déconnexions abruptes
      pingTimeout: 20000,  // CALL-FIX 2026-06-06: 10s→20s. Le pong peut tarder >10s sous charge WebRTC (CPU saturé) → faux "ping timeout"/"transport close" qui tuaient le signaling d'appel. 20s = défaut Socket.IO, tolère le jitter.
      pingInterval: 25000, // 25s - Intervalle entre les pings (par défaut)
      connectTimeout: 45000, // 45s - Timeout pour la connexion initiale
      // Autoriser reconnexion rapide
      allowEIO3: true,
      // Bandwidth sprint Phase A: lower the deflate threshold from 1024→256 so
      // frequent mid-size events (reaction:added, read-status:updated,
      // per-user presence, typing payloads with display names) are compressed
      // too. Their JSON keys are highly repetitive → strong deflate ratio.
      // Context takeover stays disabled to cap per-connection memory at the
      // 100k+ concurrent socket scale.
      perMessageDeflate: {
        threshold: 256,
        zlibDeflateOptions: { level: 6, memLevel: 7 },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
      },
      httpCompression: {
        threshold: 256,
      },
    });

    // Initialiser le SocialEventsHandler pour les broadcasts feed
    this.socialEventsHandler = new SocialEventsHandler({
      io: this.io,
      prisma: this.prisma,
    });

    // Initialiser le LocationHandler pour les événements de partage de localisation
    this.locationHandler = new LocationHandler({
      io: this.io,
      prisma: this.prisma,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      normalizeConversationId: (id: string) => this.normalizeConversationId(id),
    });

    // Initialiser le PostAudioService singleton (dépend de socialEventsHandler)
    PostAudioService.init(this.prisma, this.socialEventsHandler);

    // Initialiser le StoryTextObjectTranslationService singleton
    StoryTextObjectTranslationService.init(this.prisma, this.io);

    this.authHandler = new AuthHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      maintenanceService: this.maintenanceService,
      callService: this.callService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      userSockets: this.userSockets,
      emitPresenceSnapshot: (socket, userId, isAnonymous) =>
        this._emitPresenceSnapshot(socket, userId, isAnonymous),
      // CALL-RESILIENCE (Vague 44) — lets AuthHandler's anonymous-guest
      // disconnect leave reuse CallEventsHandler's PARTICIPANT_LEFT/
      // call:ended fanout instead of leaving the other party's UI "in call".
      broadcastCallParticipantLeft: (opts) =>
        this.callEventsHandler.broadcastParticipantLeftResult({ io: this.io, ...opts }),
      forceCleanupCallParticipant: (opts) =>
        this.callEventsHandler.forceCleanupParticipationAfterLeaveFailure({ io: this.io, ...opts }),
    });

    this.adminAgentHandler = new AdminAgentHandler({
      prisma: this.prisma,
      socketToUser: this.socketToUser,
    });

    const reactionService = new ReactionService(prisma);
    this.readStatusService = new MessageReadStatusService(prisma);
    const readStatusService = this.readStatusService;
    this.bridgeService = new ConversationBridgeService(prisma);

    this.messageHandler = new MessageHandler({
      io: this.io,
      prisma: this.prisma,
      messagingService: this.messagingService,
      translationService: this.translationService,
      statusService: this.statusService,
      notificationService: this.notificationService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      stats: this.stats,
      agentClient: this.agentClient,
      attachmentService: new AttachmentService(prisma),
      readStatusService,
      privacyPreferencesService: this.privacyPreferencesService,
      mentionService: this.mentionService,
    });

    this.statusHandler = new StatusHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      privacyPreferencesService: this.privacyPreferencesService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      userSockets: this.userSockets,
    });

    this.reactionHandler = new ReactionHandler({
      io: this.io,
      prisma: this.prisma,
      notificationService: this.notificationService,
      reactionService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
    });

    this.attachmentReactionHandler = new AttachmentReactionHandler({
      io: this.io,
      prisma: this.prisma,
      service: new AttachmentReactionService(this.prisma),
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
    });

    const commentReactionService = new CommentReactionService(prisma);
    this.commentReactionHandler = new CommentReactionHandler({
      io: this.io,
      prisma: this.prisma,
      notificationService: this.notificationService,
      commentReactionService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
    });

    const postReactionService = new PostReactionService(prisma);
    this.postReactionHandler = new PostReactionHandler({
      io: this.io,
      prisma: this.prisma,
      notificationService: this.notificationService,
      postReactionService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      // Unification du like : le ❤️ socket émet l'événement canonique `post:liked`
      // via le SocialEventsHandler (feed rooms + post room), comme le REST.
      socialEvents: this.socialEventsHandler,
    });

    this.conversationHandler = new ConversationHandler({
      prisma: this.prisma,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      readStatusService,
      // Quitter une conversation retracte la frappe qu'on y avait diffusée.
      // `disconnecting` était le seul autre chemin, et changer de conversation
      // ne déconnecte pas le socket : sans ce câblage les pairs gardent un
      // « X est en train d'écrire… » fantôme. `statusHandler` est construit
      // plus haut dans ce même constructeur.
      retractTyping: (socket, conversationId) =>
        this.statusHandler.retractTypingIn(socket, conversationId),
      // Entrer dans une conversation rattrape les partages de position en cours.
      // `location:live-started` ne touche que les sockets présents à l'instant
      // du départ : sans ce rejeu, l'épingle d'un pair qui partage déjà reste
      // invisible pour toute la session de l'arrivant. `locationHandler` est
      // construit plus haut dans ce même constructeur.
      replayLiveLocations: (socket, conversationId) =>
        this.locationHandler.replayLiveLocationsTo(socket, conversationId),
      // La liste nominative `onlineUsers` de `conversation:stats` est projetée
      // par LECTEUR à l'émission (directive produit du 2026-08-25) : le handler
      // reçoit le lecteur avec son VRAI rôle et la loi unique — la même paire
      // que `_emitPresenceSnapshot` consomme. Les stats ne partent qu'aux
      // inscrits, et le handler ne demande un lecteur que pour un `User.id`
      // résolu, d'où `isAnonymous: false`.
      presenceViewer: (userId) => this._presenceViewer(userId, false),
      presenceVisibility: this.presenceVisibilityService,
    });
  }

  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
    // The WS `message:send` path (MessageHandler) enqueues offline recipients
    // itself, in parallel with this REST-path queue — same shared instance.
    this.messageHandler.setDeliveryQueue(queue);
    // ReactionHandler enqueues reaction add/remove for offline peers on the
    // same instance, so their reaction state converges on reconnect.
    this.reactionHandler.setDeliveryQueue(queue);
    // Same for per-attachment reactions — without this an attachment reaction
    // toggled while a peer is offline was only broadcast to the live room and
    // was lost forever (their cached reactionSummary stayed stale).
    this.attachmentReactionHandler.setDeliveryQueue(queue);
  }

  /**
   * Retire du rejeu les entrées des conversations dont l'appartenance a pris
   * fin PENDANT l'absence.
   *
   * L'audience de la file est décidée à la MISE EN FILE, par
   * `enqueueForOfflineParticipants`, sur l'appartenance de cet instant-là.
   * Entre cet instant et la LIVRAISON il y a précisément l'absence — c'est-à-dire
   * la fenêtre pendant laquelle on quitte un groupe, s'en fait retirer, s'y fait
   * bannir, ou le supprime pour soi. Les quatre routes qui écrivent ces
   * transitions (`leave.ts`, `participants.ts`, `ban.ts`, `delete-for-me.ts`)
   * sortent toutes les sockets de la cible de `conversation:<id>` : le canal
   * VIVANT est fermé à l'instant même. Aucune ne touche cette file, qui garde
   * jusqu'à `DELIVERY_QUEUE_TTL_SECONDS` (48 h) d'événements de cette même
   * conversation — messages, éditions, réactions, traductions — et les rejouait
   * intégralement à la reconnexion suivante : du contenu livré APRÈS la fin de
   * l'autorisation qui le justifiait, et une conversation ressuscitée dans une
   * liste dont ces mêmes routes viennent de la retirer.
   *
   * Une autorisation se lit donc contre l'autorité au dernier instant possible,
   * jamais contre une copie prise à l'enfilement. C'est ce qui rend cette garde
   * unique et non quadruple : elle vaut pour les quatre routes et pour toute
   * transition future, sans qu'aucune ait à s'en souvenir.
   *
   * Échec OUVERT sur une PANNE, FERMÉ sur une RÉPONSE. Le drain est destructif —
   * les entrées ont déjà quitté la file quand cette garde s'exécute. Une réponse
   * « plus membre » fait autorité et l'entrée est jetée. Une absence de réponse
   * n'autorise rien à conclure : jeter l'arriéré parce que la base n'a pas
   * répondu échangerait une fuite rare (panne ET retrait ET arriéré simultanés)
   * contre une perte de données probable, une tempête de reconnexions étant
   * exactement le moment où la base est sous pression.
   *
   * `bannedAt` est filtré en JS, pas dans le `where` : sous MongoDB un
   * `bannedAt: null` ne matche pas les documents où le champ est ABSENT (jamais
   * écrit), et exclurait donc les lignes historiques — le piège que `ban.ts`
   * documente déjà pour `leftAt` (audit C5).
   *
   * **PRÉCONDITION, tenue par l'appelant** : chaque entrée porte un
   * `conversationId` de forme ObjectId (`isAddressableConversationId`). Elle
   * n'est pas cosmétique — les ids sont AGRÉGÉS en un seul `in`, donc une seule
   * entrée illisible fait lever la requête pour le lot ENTIER, et l'échec
   * atterrit dans le `catch` ci-dessous, qui rejoue tout SANS FILTRE. Le
   * fail-open y est délibéré et juste pour ce qu'il vise (une base qui ne répond
   * pas) ; il ne peut simplement pas distinguer ce cas de « nous n'avons jamais
   * posé de question valide », et sur ce second cas il transforme une entrée
   * corrompue en désactivation du gate d'autorisation. La garde vit donc chez
   * l'appelant, AVANT la requête : c'est le seul endroit où l'entrée fautive est
   * encore nommable une par une.
   */
  private async _dropEndedMemberships(
    userId: string,
    isAnonymous: boolean,
    drained: QueuedMessagePayload[]
  ): Promise<QueuedMessagePayload[]> {
    const conversationIds = [...new Set(drained.map(entry => entry.conversationId))];
    try {
      // Clé de file = `userId` pour un inscrit, `Participant.id` pour un invité
      // de lien partagé — la convention exacte que `enqueueForOfflineParticipants`
      // applique en enfilant (`p.userId ?? p.id`).
      const rows = await this.prisma.participant.findMany({
        where: isAnonymous
          ? { id: userId, conversationId: { in: conversationIds }, isActive: true }
          : { userId, conversationId: { in: conversationIds }, isActive: true },
        select: { conversationId: true, bannedAt: true },
      });
      const live = new Set(
        rows.filter(row => row.bannedAt == null).map(row => row.conversationId)
      );
      if (live.size === conversationIds.length) return drained;

      const kept = drained.filter(entry => live.has(entry.conversationId));
      logger.info('Dropped queued events for conversations the reader has left', {
        userId,
        dropped: drained.length - kept.length,
        conversationIds: conversationIds.filter(id => !live.has(id)),
      });
      return kept;
    } catch (error) {
      logger.warn('Membership re-read failed on drain — replaying the backlog unfiltered', {
        userId,
        error,
      });
      return drained;
    }
  }

  private async _drainPendingMessages(userId: string, isAnonymous: boolean): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const drained = await this.deliveryQueue.drain(userId);
      if (drained.length === 0) return;

      // Le journal par entrée est monté AVANT le gate d'appartenance, parce que
      // la première chose à refuser se refuse avant lui — voir le tri
      // d'adressabilité juste en dessous.
      //
      // `delivered` ne retient que ce qui est RÉELLEMENT parti. Les trois
      // signaux qui suivent en descendent, parce qu'ils AFFIRMENT tous les trois
      // la même chose : que le message est arrivé. La règle est celle que la
      // garde d'appartenance énonce plus bas — « l'affirmer d'un message qu'on
      // vient de refuser de livrer mentirait à son auteur ». Elle ne couvrait
      // que le refus ; elle couvre maintenant l'échec.
      //
      // Le journal est PAR ENTRÉE, et il NOMME son message. C'est la seule
      // trace qu'une perte de rejeu laissera jamais : ni exception qui remonte,
      // ni événement côté client, ni compteur qui bouge — le destinataire n'a
      // simplement pas reçu son message. Un résumé chiffré ne suffirait pas,
      // parce que ce qu'il faut pour rattraper la perte est l'IDENTITÉ de ce
      // qui est tombé, pas son nombre.
      const delivered: QueuedMessagePayload[] = [];
      const undelivered: QueuedMessagePayload[] = [];
      const dropEntry = (entry: QueuedMessagePayload, reason: string, error?: unknown): void => {
        undelivered.push(entry);
        logger.error('Queued entry dropped without delivery — it is already out of the queue', {
          userId,
          reason,
          conversationId: entry.conversationId,
          messageId: entry.messageId,
          eventType: entry.eventType ?? 'new',
          error,
        });
      };

      // PREMIER refus, et il est en amont du gate d'autorisation par nécessité,
      // pas par goût de l'ordre : `_dropEndedMemberships` AGRÈGE les
      // `conversationId` du lot en un seul `conversationId: { in: [...] }`. Une
      // entrée dont l'id n'est pas interrogeable ne se contente donc pas de se
      // perdre elle-même — elle fait lever la requête pour TOUT le lot, et
      // l'échec tombe dans un `catch` qui rejoue l'arriéré SANS FILTRE.
      // C'est-à-dire : une seule entrée illisible désactive le gate
      // d'autorisation du rejeu, et l'arriéré d'une conversation quittée — ou
      // dont le lecteur a été banni — repart en entier.
      //
      // C'est l'isolation que la couche du dessous PROMET (« so one corrupt
      // entry can never poison a whole drain/peek », `parseRawEntries`) et que
      // le cycle 111 a déjà dû rétablir une fois, sur le comparateur de tri.
      // Même famille, une couche plus haut, et cette fois sur l'AUTORISATION :
      // l'entrée corrompue n'y désordonne pas les entrées saines, elle les
      // déshabille de leur gate.
      const addressable = drained.filter(entry => {
        if (isAddressableConversationId(entry.conversationId)) return true;
        dropEntry(entry, 'conversation-id-not-addressable');
        return false;
      });
      // Rien d'adressable : il n'y a aucune conversation à NOMMER, donc rien à
      // faire chercher au client. Le journal ci-dessus est la seule trace
      // possible, et c'est déjà la règle que ce chemin applique — on ne
      // fabrique pas un signal de récupération qui ne désigne rien.
      if (addressable.length === 0) return;

      // Gate d'autorisation, avant toute émission : une entrée dont
      // l'appartenance a pris fin n'est pas rejouée, et ne compte donc dans
      // aucun des trois signaux ci-dessous (émission, `pending-messages:delivered`,
      // accusé de réception). Un accusé affirme « ce message est arrivé chez son
      // destinataire » — l'affirmer d'un message qu'on vient de refuser de livrer
      // mentirait à son auteur.
      const pending = await this._dropEndedMemberships(userId, isAnonymous, addressable);
      if (pending.length === 0) return;

      logger.info(`Delivering ${pending.length} queued messages to ${userId}`);
      // Emit to the user room so EVERY currently-connected device of this user
      // receives the replay (the drain is destructive — a single-socket emit
      // would lose the messages for the user's other devices). Safe because
      // AuthHandler joins ROOMS.user(...) BEFORE registering the socket and
      // before the presence-snapshot/drain call, for both JWT and anonymous
      // paths (anonymous personal rooms use the participant id).
      // Ce site portait un cast — `as unknown as { emit(event: string, payload:
      // unknown): void }` — sous ce commentaire : « les charges rejouées sont du
      // JSON opaque, mises en forme à l'enfilage, donc les revérifier contre
      // `ServerToClientEvents` ici est IMPOSSIBLE ».
      //
      // C'était vrai, et ça ne l'est plus depuis le cycle 104 : `_drainedEmissions`
      // rend des `SocketEmission`, c'est-à-dire des `ServerEmission` — un couple
      // `(événement, charge)` CORRÉLÉ — et l'affirmation de ce couple est posée
      // là où la forme est réellement connue, à la frontière de désérialisation.
      // Le rejeu n'a donc plus besoin d'une porte à lui : il passe par la même
      // que la diffusion directe.
      //
      // Le cast était une PORTE, pas une commodité, et c'est ce qui l'a rendu
      // invisible : le balayage du cycle 104 cherche des DÉCLARATIONS
      // (`emit(event: string, …)`), et une porte peut aussi s'ouvrir par
      // assertion de type.
      const userRoom = this.io.to(ROOMS.user(userId));

      // Le rejeu est isolé PAR ENTRÉE, et ce n'est pas une précaution de style :
      // `drain()` a DÉJÀ retiré ces entrées de Redis et de la file mémoire. Tout
      // ce qui n'est pas émis dans cette boucle est perdu sans recours — il n'y
      // a pas de seconde lecture.
      //
      // La couche du dessous porte déjà cette garantie et l'écrit :
      // `parseRawEntries` laisse tomber une entrée illisible « so one corrupt
      // entry can never poison a whole drain/peek ». Nue, cette boucle-ci la
      // reprenait d'une main et la rendait de l'autre — un seul `emit` qui lève
      // (adaptateur en défaut, encodeur sur une charge non sérialisable de la
      // tranche MÉMOIRE, qui n'a jamais traversé JSON) emportait toutes les
      // entrées SUIVANTES, plus `pending-messages:delivered`, plus TOUS les
      // accusés de réception. C'est la leçon du cycle 98 — « un correctif prouvé
      // à une couche peut être défait par la couche qui le consomme » — en
      // amont, et sur le chemin le plus destructif du système.
      //
      // Le journal par entrée (`dropEntry`, monté avant le gate d'appartenance)
      // porte les QUATRE refus de ce chemin — l'id de conversation illisible, la
      // charge informe, le nom d'événement non résolu, l'enveloppe de lien
      // privée de son message — chacun sous sa propre `reason`, parce qu'aucun
      // des quatre n'envoie chercher au même endroit.
      for (const entry of pending) {
        // Les deux moitiés du couple, refusées séparément parce que le journal
        // doit NOMMER laquelle a manqué : c'est la seule trace qu'une perte de
        // rejeu laissera jamais, et « le nom » et « la charge » n'envoient pas
        // chercher au même endroit.
        if (!isDeliverableQueuedPayload(entry.payload)) {
          dropEntry(entry, 'payload-not-an-object');
          continue;
        }
        const emissions = _drainedEmissions(entry);
        if (emissions.length === 0) {
          // Deux façons de ne rien savoir diffuser, et le journal doit les
          // SÉPARER : elles n'envoient pas chercher au même endroit. Un nom
          // d'événement non résolu accuse la file (un `eventType` d'une version
          // plus récente de la passerelle) ; une enveloppe de lien sans message
          // accuse son producteur. `'link-message'` est le seul `eventType` dont
          // la charge se DÉPLIE, donc le seul qui puisse échouer par autre chose
          // que son nom.
          dropEntry(
            entry,
            entry.eventType === 'link-message'
              ? 'link-envelope-without-message'
              : 'unresolvable-event-type'
          );
          continue;
        }
        try {
          for (const emission of emissions) {
            emitServerEvent(userRoom, emission);
          }
          delivered.push(entry);
        } catch (error) {
          dropEntry(entry, 'emit-failed', error);
        }
      }

      // `count` ne compte QUE ce qui est parti — c'est une affirmation de
      // livraison, elle doit rester vraie. `conversationIds`, lui, porte les
      // conversations TOUCHÉES par le drain, rejeu réussi ou entrée perdue.
      //
      // La distinction est ce qui rend une perte RÉCUPÉRABLE au lieu de
      // définitive : l'unique consommateur de cet événement s'en sert pour
      // invalider les messages des conversations nommées
      // (`use-socket-cache-sync`, `handlePendingMessagesDelivered`), et les
      // messages qu'une entrée indélivrable transportait sont, eux, toujours en
      // base — seul leur rejeu temps réel a échoué. Nommer la conversation
      // envoie donc le client les rechercher. L'omettre transformerait un
      // incident de transport en trou permanent dans le fil.
      //
      // Ces deux champs ne disent pas la même chose et c'est délibéré : un
      // `count: 0` accompagné d'une conversation nommée se lit exactement comme
      // ce qui s'est passé — « rien n'a pu être rejoué, va relire celle-ci ».
      //
      // Isolé, pour la même raison que la boucle au-dessus et que les canaux de
      // `NotificationService.emitBestEffort` : ce signal DÉCLENCHE une relecture
      // là où les accusés qui suivent font avancer la coche de l'expéditeur.
      // Nu, il faisait porter aux seconds le sort du premier — et la panne qui
      // fait lever un `emit` les fait lever tous les deux.
      try {
        // Filtré par la MÊME garde que le tri d'adressabilité : une entrée
        // refusée pour son id de conversation n'a rien à nommer ici. Publier son
        // id enverrait le client invalider une conversation qui n'existe pas —
        // un signal de récupération qui ne désigne rien vaut moins que le
        // silence, et le journal par entrée reste, lui, la trace de la perte.
        const affectedConversationIds = [
          ...new Set(
            [...delivered, ...undelivered]
              .map(e => e.conversationId)
              .filter(isAddressableConversationId)
          ),
        ];
        userRoom.emit(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, { count: delivered.length, conversationIds: affectedConversationIds });
      } catch (error) {
        logger.error('Failed to announce the end of the offline replay', { userId, error });
      }

      // Emit delivery receipts to senders so their checkmarks advance from
      // "sent" (single tick) to "delivered" (double tick) as soon as the
      // messages land on the recipient's device — matching WhatsApp / iMessage
      // behaviour instead of waiting for the user to open the conversation.
      //
      // `isAnonymous` voyage AVEC la clé, il n'est pas redécouvert en aval :
      // c'est lui qui dit sous quelle colonne retrouver le lecteur (`userId`
      // pour un inscrit, `Participant.id` pour un invité de lien). Un `return`
      // se tenait ici pour les lecteurs sans compte, sur la justification
      // « participant lookup is keyed on Participant.userId, null for
      // anonymous » — vraie de la REQUÊTE d'alors, jamais du droit de l'auteur
      // à voir sa coche avancer. Le lecteur sans compte est la population
      // DOMINANTE d'une conversation ouverte par lien de partage : l'auteur y
      // restait sur un tic unique jusqu'à ce que quelqu'un OUVRE la
      // conversation, c'est-à-dire exactement l'attente que cette unité existe
      // pour supprimer.
      this._emitDeliveryForDrainedMessages(userId, delivered, isAnonymous).catch(err => {
        logger.warn('Failed to emit delivery receipts for drained messages', { userId, error: err });
      });
    } catch (error) {
      logger.warn('Failed to drain pending messages', { userId, error });
    }
  }

  /**
   * After draining queued messages to a reconnecting user, mark those
   * messages as "received" on their behalf and broadcast `read-status:updated`
   * to the conversation rooms so senders see the delivery checkmark advance.
   *
   * Respects the reader's `showReadReceipts` privacy preference — on the
   * BROADCAST only. The delivery cursor is advanced either way, exactly as the
   * REST doors do (`mark-as-received`, `delivery-receipt`) and as
   * `broadcastReadStatus` documents.
   * Batches the participant lookup across all affected conversations in a
   * single Prisma query to minimise round-trips on the reconnect path.
   *
   * `readerKey` porte la CLÉ DE FILE, pas un `User.id` : c'est `userId` pour un
   * inscrit et `Participant.id` pour un invité de lien partagé — la convention
   * exacte qu'`enqueueForOfflineParticipants` applique en enfilant
   * (`p.userId ?? p.id`), et que `_dropEndedMemberships` lit déjà sous les deux
   * colonnes. Le paramètre porte ce nom-là parce que le supposer utilisateur
   * est PRÉCISÉMENT ce qui a fait sauter l'accusé pour la moitié anonyme.
   */
  private async _emitDeliveryForDrainedMessages(
    readerKey: string,
    pending: QueuedMessagePayload[],
    isAnonymous: boolean
  ): Promise<void> {
    // Delivery receipts only make sense for entries that announce a message
    // ARRIVING — a mutation entry (edit, delete, reaction, pin, attachment
    // enrichment, translation) replays its own event (see `drainedEventName`)
    // but was never awaiting a "delivered" checkmark in the first place.
    //
    // Le prédicat est NOMMÉ et vit avec le vocabulaire (`queuedMessageArrival`)
    // plutôt qu'écrit ici en égalité littérale : la forme `=== 'new'` disait
    // moins que le commentaire au-dessus d'elle, et `link-message` — une
    // création, rejouée sous `message:new` comme la nominale — est tombée dans
    // l'écart. Cf. la doc du module pour ce que ça coûtait à l'auteur.
    const arrivals = pending.filter((entry) => announcesMessageArrival(entry.eventType));
    if (arrivals.length === 0) return;

    // Check privacy preference first — single cheap cached call.
    //
    // Les préférences se lisent sous la MÊME clé que la file, avec la nature du
    // lecteur — même idiome qu'`autoDeliverToOnlineRecipients`. Déclarer
    // inscrit un lecteur sans compte enverrait un `Participant.id` à
    // `fetchManyFromDatabase` comme s'il s'agissait d'un `User.id` : une
    // requête payée pour rien, dont le résultat vide serait mis en cache sous
    // un id qui n'est pas un utilisateur, et dont l'absence de
    // `showReadReceipts` re-supprimerait l'accusé juste en dessous.
    // `getPreferencesForUsers` sert les anonymes par les défauts, sans base.
    const prefMap = await this.privacyPreferencesService.getPreferencesForUsers([
      { id: readerKey, isAnonymous },
    ]);
    // La préférence tait la DIFFUSION, elle n'annule pas l'ENREGISTREMENT — même
    // contrat que les trois portes REST et que `broadcastReadStatus`, dont la
    // doc porte la règle. Sortir ici, comme ce chemin le faisait, faisait
    // dépendre l'ÉTAT du transport : la livraison du même message laissait une
    // trace par REST et aucune par le drain de reconnexion. `showReadReceipts`
    // étant RÉVERSIBLE et le gate réel étant à la lecture
    // (`_loadReadReceiptOptOuts`), l'arriéré ressortait « jamais livré » dès la
    // réactivation, faisant régresser les coches de l'expéditeur.
    const mayBroadcastReceipt = prefMap.get(readerKey)?.showReadReceipts === true;

    // Group by conversationId, keeping the last (newest) messageId per conv
    // so we call markMessagesAsReceived once per conversation.
    const convLatest = new Map<string, string>();
    for (const entry of arrivals) {
      convLatest.set(entry.conversationId, entry.messageId);
    }

    // Batch-resolve ALL active participants for the affected conversations in a
    // single query. We need two things from it: (a) the reconnecting reader's own
    // participant row per conversation (to mark received), and (b) every
    // participant's userId, so the receipt fans out to each sender's user room —
    // a sender who left the conversation view (socket dropped `conversation:<id>`
    // but stays in `user:<id>`) must still see their checkmark advance.
    const participantRows = await this.prisma.participant.findMany({
      where: { conversationId: { in: [...convLatest.keys()] }, isActive: true },
      select: { id: true, userId: true, conversationId: true },
    });

    // conversationId → the reconnecting reader's OWN row (drives markReceived
    // and the actor identity of the payload).
    //
    // La colonne interrogée suit la nature du lecteur, et le branchement reste
    // STRICT dans les deux sens : un `row.id === readerKey || row.userId ===
    // readerKey` adopterait, pour un inscrit, la ligne d'un participant SANS
    // COMPTE dont l'id coïncide — accusant réception au nom d'un tiers.
    const ownParticipant = new Map<string, ParticipantRoomTarget>();
    // conversationId → every participant, room-addressable (drives the fanout).
    // Accountless rows are KEPT: `emitToConversationParticipants` names their
    // room after `Participant.id`. Filtering on `userId` here left an anonymous
    // sender stuck on a single "sent" tick forever, since the receipt for the
    // message they sent never reached the only room they are in.
    const convParticipants = new Map<string, ParticipantRoomTarget[]>();
    for (const row of participantRows) {
      const isOwnRow = isAnonymous ? row.id === readerKey : row.userId === readerKey;
      if (isOwnRow) ownParticipant.set(row.conversationId, { id: row.id, userId: row.userId });
      const list = convParticipants.get(row.conversationId) ?? [];
      list.push({ id: row.id, userId: row.userId });
      convParticipants.set(row.conversationId, list);
    }

    await Promise.allSettled(
      [...ownParticipant].map(async ([conversationId, own]) => {
        const latestMessageId = convLatest.get(conversationId);
        if (!latestMessageId) return;

        await this.readStatusService.markMessagesAsReceived(own.id, conversationId, latestMessageId);
        if (!mayBroadcastReceipt) return;

        const summary = await this.readStatusService.getLatestMessageSummary(conversationId);
        const drainPayload = {
          conversationId,
          participantId: own.id,
          // `User.id` de l'ACTEUR, `null` s'il n'en a pas — ce que le type
          // énonce (`ReadStatusUpdatedEventData.userId: string | null`), ce que
          // les décodeurs acceptent déjà (iOS `String?`, Android `String? =
          // null`) et ce que le jumeau en ligne émet déjà (`firstAcker.userId`).
          // Y mettre `readerKey` remplirait le champ d'un `Participant.id` qu'un
          // consommateur comparant à sa propre identité pour synchroniser son
          // curseur lirait comme un `User.id` — la seule forme qui puisse
          // mentir. Pour un inscrit, `own.userId` VAUT `readerKey` : c'est par
          // lui que la ligne a été reconnue.
          userId: own.userId,
          type: 'received' as const,
          updatedAt: new Date(),
          summary,
        };
        // Chain the conversation room + each participant's user room, deduped so
        // Socket.IO delivers the event at most once per socket. Same unit as the
        // four sibling emitters of this same event — `autoDeliverToOnlineRecipients`,
        // `broadcastReadStatus` (l'unité partagée des trois portes REST) — so
        // authors never get stuck on a single "sent" tick after navigating away.
        // The copy this replaces filtered on `userId` one step earlier than the
        // others, at the `Map` it built rather than at the emit, which is why the
        // sweep that unified the verbatim copies never saw it.
        const rooms = emitToConversationParticipants({
          io: this.io,
          conversationId,
          participants: convParticipants.get(conversationId) ?? [],
          event: SERVER_EVENTS.READ_STATUS_UPDATED,
          payload: drainPayload,
        });
        logger.debug('drain delivery receipt emitted', { readerKey, isAnonymous, conversationId, latestMessageId, rooms });
      })
    );
  }

  /**
   * Queue a message-aggregate mutation (pin/unpin from the REST pin routes,
   * edit/delete from the five REST mutation routes via
   * `broadcastMessageMutation`) for every OFFLINE conversation participant so
   * their state converges on reconnect — the REST-side counterpart of the
   * offline-replay guarantee `MessageHandler` gives the socket edit/delete path
   * and `ReactionHandler` gives reactions. Without this a `message:pinned` /
   * `message:edited` / `message:deleted` emitted only to the live conversation
   * room is lost for anyone offline at that moment: their cached copy stays
   * stale until an unrelated full conversation refetch happens.
   *
   * The actor is excluded by userId (the REST pin routes run under
   * `requiredAuth`, so the actor is always a registered user) and online
   * participants are skipped — they already got the live emit. The default
   * (messageId) dedup identity is correct here: `pinned` and `unpinned` carry
   * distinct eventTypes so a pin-then-unpin keeps both entries in enqueue
   * order, while a repeated same-direction toggle supersedes in place. Pin
   * entries never bear a delivery receipt (`_emitDeliveryForDrainedMessages`
   * keeps only the entries `announcesMessageArrival` admits, and a pin is a
   * mutation of a message already arrived).
   */
  async enqueueOfflineMessageMutation(params: {
    conversationId: string;
    actorUserId: string | null | undefined;
    messageId: string;
  } & QueuedVariantFor<'pinned' | 'unpinned' | 'edited' | 'deleted'>): Promise<void> {
    await this._enqueueForOfflineParticipants(params);
  }

  /**
   * Queue a share-link message for every OFFLINE conversation participant.
   *
   * `POST /links/:id/messages` and its authenticated twin bypass
   * `MessagingService.handleMessage` and announce the message with a single
   * `io.to(conversation:<id>).emit(LINK_MESSAGE_NEW)`. That room holds
   * CONNECTED sockets only, so before this existed a message sent through a
   * share link was never replayed to a participant who happened to be offline —
   * the same failure the queue closes for `message:new` on both the socket and
   * the nominal REST send paths. The share link is the PRIMARY (and only) send
   * transport for anonymous participants, so this was the most severe class of
   * event the gap could still swallow: a whole message, not a stale counter.
   *
   * The actor is excluded by participant id — an anonymous author has no
   * `User.id` at all, which is precisely why this cannot reuse the userId-keyed
   * exclusion of `enqueueOfflineMessageMutation` above.
   *
   * `payload` must be the peer-facing (cid-stripped) body, identical to the
   * live emit: a replay carrying the author's `clientMessageId` would leak
   * their local optimistic id into another user's id space.
   */
  async enqueueOfflineLinkMessage(params: {
    conversationId: string;
    actorParticipantId: string | null | undefined;
    messageId: string;
    payload: QueuedPayloadFor<'link-message'>;
  }): Promise<void> {
    await this._enqueueForOfflineParticipants({ ...params, eventType: 'link-message' });
  }

  /**
   * Push a fresh unread badge to every recipient of a message this manager did
   * not broadcast itself — today the two share-link send routes, via
   * `broadcastLinkMessage`.
   *
   * Those routes bypass both `MessagingService.handleMessage` and this
   * manager's `_broadcastNewMessage`, where the badge fan-out used to live
   * inline (and, on the socket transport, inside a `private` method of
   * `MessageHandler`). Neither was reachable from a route, so a message sent
   * through a share link — the only send transport an anonymous participant has
   * — moved nobody's unread pill. The web `link:message:new` handler bumps the
   * conversation's preview and ordering but NOT its counter, and the list runs
   * on `staleTime: Infinity`, so the pill kept its previous value indefinitely.
   *
   * Public wrapper over the shared unit for the same reason
   * `enqueueOfflineLinkMessage` is one: an obligation every writer owes its
   * recipients cannot live behind `private`.
   */
  async emitUnreadCountsToRecipients(params: {
    conversationId: string;
    senderId: string | null | undefined;
  }): Promise<void> {
    await emitUnreadCountsToRecipients({
      io: this.io,
      prisma: this.prisma,
      readStatusService: this.readStatusService,
      bridgeService: this.bridgeService,
      conversationId: params.conversationId,
      senderId: params.senderId,
      onError: (error) => logger.warn('unread count update failed (link message)', { error }),
    });
  }

  /**
   * Mark the message delivered for every recipient connected right now, so the
   * SENDER's checkmark advances from "sent" to "delivered".
   *
   * Public wrapper for the same reason as the two above, but over the handler
   * rather than a free unit: the implementation needs `io`, `connectedUsers`,
   * the read-status service and the privacy service, which is why it lives on
   * `MessageHandler` and why no route could ever call it. Both nominal
   * transports already reach it — `broadcastNewMessage` on the WS path, and
   * `_broadcastNewMessage` below on the REST/ZMQ one — so this wrapper closes
   * the third and last transport rather than adding behavior.
   *
   * Delegating (instead of re-implementing for links) is the point: three
   * transports emitting three subtly different receipts is exactly the drift a
   * single shared implementation forbids.
   */
  async autoDeliverToOnlineRecipients(
    message: { id: string; senderId: string | null },
    conversationId: string
  ): Promise<void> {
    await this.messageHandler.autoDeliverToOnlineRecipients(message, conversationId);
  }

  private async _enqueueForOfflineParticipants(params: OfflineParticipantQueueParams): Promise<void> {
    await enqueueForOfflineParticipants(
      { deliveryQueue: this.deliveryQueue, prisma: this.prisma, connectedUsers: this.connectedUsers },
      params
    );
  }

  /**
   * Queue a reaction toggle for every OFFLINE conversation participant so their
   * state converges on reconnect — the REST-side counterpart of the guarantee
   * `ReactionHandler` gives the socket `reaction:add` / `reaction:remove` path,
   * and the reaction sibling of `enqueueOfflineMessageMutation` above.
   *
   * Delegates to the single shared implementation so the socket handler, the
   * REST routes (via `broadcastReactionMutation`) and the agent reaction path
   * cannot drift — in particular on the finer (messageId, reactor, emoji) dedup
   * identity, without which two reactors on one message collapse into a single
   * queued entry.
   */
  async enqueueOfflineReactionMutation(params: ReactionOfflineQueueParams): Promise<void> {
    await enqueueOfflineReactionEvent(
      { deliveryQueue: this.deliveryQueue, prisma: this.prisma, connectedUsers: this.connectedUsers },
      params
    );
  }

  /**
   * Normalise l'identifiant de conversation pour créer une room cohérente
   * Résout identifier/ObjectId vers l'identifier canonique
   */
  private async normalizeConversationId(conversationId: string): Promise<string> {
    try {
      if (isValidObjectId(conversationId)) return conversationId;
      const cached = this.conversationIdCache.get(conversationId);
      if (cached) return cached;
      const conversation = await this.prisma.conversation.findUnique({
        where: { identifier: conversationId },
        select: { id: true, identifier: true }
      });
      if (conversation) {
        this.conversationIdCache.set(conversationId, conversation.id);
        return conversation.id;
      }
      return conversationId;
    } catch (error) {
      logger.error('❌ [NORMALIZE] Erreur normalisation', error);
      return conversationId;
    }
  }

  /**
   * Expose NotificationService for use in routes
   */
  public getNotificationService(): NotificationService {
    return this.notificationService;
  }

  /**
   * Invalidate the in-process participant-ID cache for a user.
   * Called by REST routes that change participant membership or role so that
   * the next socket `message:send` re-validates against the DB instead of
   * serving a stale cached entry (e.g. a kicked user still appearing as
   * member for up to 5 minutes without this invalidation).
   */
  public invalidateParticipantCache(userId: string, conversationId?: string): void {
    this.messageHandler.invalidateParticipantCache(userId, conversationId);
  }

  /**
   * Éteint les partages de position en cours d'un fil qui vient d'être clos.
   *
   * Unique appelant : `announceConversationClosed`, le point de convergence des
   * trois chemins de clôture — c'est là qu'est écrit POURQUOI l'extinction
   * précède l'annonce. Le registre vit dans `LocationHandler` ; le gestionnaire
   * n'en est que le porteur, comme pour `invalidateParticipantCache`.
   */
  public endLiveLocationsForClosedConversation(conversationId: string): void {
    this.locationHandler.endSessionsForClosedConversation(conversationId);
  }

  /**
   * Éteint le partage de position qu'un membre tenait dans un fil dont il vient
   * de SORTIR — le fil, lui, continue de vivre.
   *
   * Unique appelant : `endConversationMembership`, le point de convergence des
   * quatre chemins de fin d'appartenance — c'est là qu'est écrit POURQUOI
   * l'extinction précède l'éviction des rooms.
   */
  public endLiveLocationForDepartedMember(conversationId: string, userId: string): void {
    this.locationHandler.endSessionsForDepartedMember(conversationId, userId);
  }

  /**
   * Sort un membre des appels EN COURS du fil dont il vient de perdre
   * l'appartenance.
   *
   * Unique appelant : `endConversationMembership`, le point de convergence des
   * quatre chemins de fin d'appartenance — c'est là qu'est écrit POURQUOI
   * l'extinction précède l'éviction des rooms. Le raisonnement propre à
   * l'appel (room distincte, autorisation lue sur `CallParticipant`, verbe de
   * retrait muselé par la perte du droit) vit dans
   * `CallEventsHandler.endCallParticipationForDepartedMember` ; le
   * gestionnaire n'en est que le porteur, comme pour la position vive.
   *
   * Ne rejette jamais : sans serveur Socket.IO il n'y a par construction
   * aucune room d'appel à défaire, et le handler absorbe ses propres échecs.
   */
  public async endCallParticipationForDepartedMember(
    conversationId: string,
    userId: string
  ): Promise<void> {
    if (!this.io) return;
    await this.callEventsHandler.endCallParticipationForDepartedMember({
      io: this.io,
      conversationId,
      userId
    });
  }

  /**
   * Expose SocialEventsHandler for use in routes (broadcast social events)
   */
  public getSocialEventsHandler(): SocialEventsHandler {
    return this.socialEventsHandler;
  }

  /**
   * Expose broadcast function for REST-triggered presence updates
   * Permet au StatusService du serveur de broadcaster les changements de présence
   */
  public getPresenceBroadcastCallback(): (userId: string, isOnline: boolean, isAnonymous: boolean) => void {
    return (userId: string, isOnline: boolean, isAnonymous: boolean) => {
      this._broadcastUserStatus(userId, isOnline, isAnonymous);
    };
  }

  /**
   * Source de vérité runtime pour la présence : true si l'id (userId pour registered,
   * participantId pour anonyme) est actuellement dans `connectedUsers` Map. Utilisé par
   * les routes REST pour overrider le `isOnline` de la DB (potentiellement obsolète).
   */
  public isPresenceOnline(idOrUserId: string): boolean {
    return this.connectedUsers.has(idOrUserId);
  }

  /**
   * Le LECTEUR de l'instantané, avec son VRAI rôle — la seule donnée qui
   * autorise un ADMIN/BIGBOSS à voir la présence de qui il regarde.
   *
   * Ni `SocketUser`, ni `socket.data`, ni le contexte du handshake ne portent
   * `User.role` (mesuré : le `select` de `AuthHandler._authenticateJWTUser` ne
   * lit que les langues). Il est donc relu UNE fois par connexion, sur un
   * chemin qui fait déjà plusieurs lectures — jamais par contact filtré.
   *
   * Un lecteur ANONYME n'est pas un lecteur de rang bas : il n'a AUCUNE
   * relation, donc la loi partagée lui rend `null` et tout est masqué. C'est
   * `PresenceVisibilityService` qui le dit — ici on ne fait que ne pas
   * fabriquer d'identité pour lui.
   */
  private async _presenceViewer(userId: string, isAnonymous: boolean): Promise<PresenceViewer> {
    if (isAnonymous) return null;
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    // Pas de ligne — socket périmé, compte supprimé — ⇒ AUCUN lecteur, donc
    // tout masqué. Même refus fermé que la porte REST jumelle
    // (`viewerFromAuthContext`, `routes/users/presence-gate.ts`), qui rend
    // `null` pour un contexte inscrit sans rôle : une identité qu'on ne sait
    // pas qualifier ne se voit accorder aucune relation.
    if (!row) return null;
    // Une ligne SANS rôle lisible reste un lecteur ordinaire : elle garde ses
    // amitiés et ne gagne aucun privilège.
    return { userId, role: row.role ?? 'USER' };
  }

  /**
   * Applique la visibilité de présence de CHAQUE contact pour CE lecteur —
   * amitié acceptée, rôle du lecteur, blocage bidirectionnel et préférences,
   * tenus ensemble par `PresenceVisibilityService.resolveForTargets`, la même
   * porte que `GET /users/presence`.
   *
   * Directive produit (2026-08-25) : partager une conversation n'autorise plus
   * rien. Le prédécesseur (`_applyPresencePrefs`) n'appliquait que les
   * préférences et le blocage, donc un co-participant INCONNU recevait la
   * pastille et la dernière connexion de tout le monde à chaque reconnexion.
   *
   * Masqué se présente ici comme HORS LIGNE (`isOnline: false`,
   * `lastActiveAt: null`) et non comme une absence : le contact reste dans la
   * liste — les clients typent `isOnline` non nullable sur ce canal — mais il
   * n'en apprend rien. `lastActiveAt` voyage À CÔTÉ d'`isOnline` et tombe avec
   * lui : un gate posé sur le seul drapeau laisserait partir l'horodatage, qui
   * est précisément ce que la directive interdit de révéler.
   *
   * Le filtre est appliqué à l'ÉMISSION, jamais au cache : `presenceSnapshotCache`
   * stocke l'état BRUT, partagé par tous les lecteurs, et la visibilité est par
   * lecteur.
   */
  private async _applyPresenceVisibility(
    viewer: PresenceViewer,
    users: { userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }[],
  ): Promise<{ userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }[]> {
    if (users.length === 0) return users;
    const visibility = await this.presenceVisibilityService.resolveForTargets(
      viewer,
      users.map(u => u.userId),
    );
    // Les ids ANONYMES (des `Participant.id`) n'ont pas de compte : le
    // résolveur ne leur trouve ni amitié ni préférence, donc il rend HIDDEN —
    // sauf à un ADMIN+, à qui il rend FULL pour tout id qu'on lui présente.
    return users.map(u => applyPresenceVisibilityAsOffline(u, visibility.get(u.userId)));
  }

  /**
   * Émet `presence:snapshot` au socket fraîchement authentifié : l'état de
   * présence des contacts du nouvel arrivant, pour que le client amorce son
   * store sans attendre la prochaine transition.
   *
   * La LISTE des contacts reste dérivée des conversations — c'est la façon la
   * moins chère de nommer « les gens que ce client va afficher ». Ce n'est PAS
   * une autorisation : chaque entrée traverse ensuite
   * `_applyPresenceVisibility`, où un co-participant qui n'est ni ami accepté
   * ni ADMIN+ ressort HORS LIGNE, sans dernière connexion (directive produit du
   * 2026-08-25). Ce qui gouverne l'audience est la RELATION ; la conversation
   * ne fait que fournir des candidats.
   */
  private async _emitPresenceSnapshot(socket: Socket, userId: string, isAnonymous: boolean): Promise<void> {
    try {
      const viewer = await this._presenceViewer(userId, isAnonymous);
      const cached = this.presenceSnapshotCache.get(userId);
      if (cached && Date.now() - cached.cachedAt < this.PRESENCE_SNAPSHOT_CACHE_TTL_MS) {
        const users = await this._applyPresenceVisibility(
          viewer,
          cached.users.map(u => ({ ...u, isOnline: this.connectedUsers.has(u.userId) })),
        );
        socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, { users });
        logger.info(`📸 [PRESENCE_SNAPSHOT] ${users.length} contacts (cache) sent to ${userId}`);
      } else {
        // Trouver toutes les conversations du user/participant
        const participantRows = isAnonymous
          ? await this.prisma.participant.findMany({
              where: { id: userId, isActive: true },
              select: { conversationId: true }
            })
          : await this.prisma.participant.findMany({
              where: { userId: userId, isActive: true },
              select: { conversationId: true }
            });

        if (participantRows.length > 0) {
          const conversationIds = participantRows.map(p => p.conversationId);

          // Lister tous les autres participants (registered + anonymes) de ces conversations
          const contacts = await this.prisma.participant.findMany({
            where: {
              conversationId: { in: conversationIds },
              isActive: true,
              NOT: isAnonymous
                ? { id: userId }
                : { userId: userId }
            },
            select: {
              id: true,
              userId: true,
              displayName: true,
              type: true,
              lastActiveAt: true,
              user: { select: { id: true, username: true, displayName: true, lastActiveAt: true } }
            }
          });

          // Dédupliquer par userId (un même user peut être dans plusieurs conversations)
          const seen = new Set<string>();
          const users: { userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }[] = [];

          for (const c of contacts) {
            const presenceKey = c.userId ?? c.id; // userId pour registered, id pour anonyme
            if (seen.has(presenceKey)) continue;
            seen.add(presenceKey);

            const isOnline = this.connectedUsers.has(presenceKey);
            const username = c.user?.username ?? c.user?.displayName ?? c.displayName ?? presenceKey;
            const lastActiveAt = c.user?.lastActiveAt ?? c.lastActiveAt ?? null;

            users.push({ userId: presenceKey, username, isOnline, lastActiveAt });
          }

          this.presenceSnapshotCache.set(userId, { users, cachedAt: Date.now() });
          socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, {
            users: await this._applyPresenceVisibility(viewer, users),
          });
          logger.info(`📸 [PRESENCE_SNAPSHOT] ${users.length} contacts sent to ${userId} (${users.filter(u => u.isOnline).length} online)`);
        }
      }
    } catch (error) {
      logger.error('❌ [PRESENCE_SNAPSHOT] Failed to build snapshot', error);
    }

    // Drain offline delivery queue regardless of snapshot cache hit/miss AND of
    // whether the snapshot build above threw. `_drainPendingMessages` is the sole
    // reconnect trigger that replays queued offline messages + their delivered
    // receipts; the presence snapshot ("who's online") is cosmetic and must never
    // gate it. Previously both lived in one try/catch, so a transient DB error in
    // the snapshot build stranded queued messages until the next clean reconnect
    // (or the queue TTL). Both calls carry their own `.catch` — they are
    // independent of the snapshot outcome.
    // Anonymous users drain too: their queue is keyed by participant id
    // (same key as connectedUsers / ROOMS.user for anonymous identities).
    this._drainPendingMessages(userId, isAnonymous).catch(err => {
      logger.warn('Failed to drain pending messages on connect', { userId, error: err });
    });
    // Les DEUX identités, comme l'instantané de présence vingt lignes plus haut.
    // Le `if (!isAnonymous)` qui se tenait ici n'exprimait aucune règle produit :
    // il masquait une résolution de participant qui ne lisait que la colonne
    // `userId`, donc rendait zéro ligne pour un invité de lien partagé. Le
    // brancher sans corriger la lecture aurait été un no-op silencieux — la
    // raison pour laquelle le trou a survécu à ses propres témoins.
    this._emitUnreadCountsSnapshot(socket, userId, isAnonymous).catch(err => {
      logger.warn('Failed to emit unread counts snapshot on reconnect', { userId, isAnonymous, error: err });
    });
  }

  /**
   * Remet les pastilles d'aplomb à la reconnexion — le SEUL signal qui le
   * fasse. La file hors-ligne rejoue l'aperçu, le rang et la promotion en tête
   * de chaque ligne (`drainedEventName` ne mappe que des événements de
   * message) ; le COMPTEUR, lui, ne se calcule que côté serveur, depuis les
   * curseurs de lecture.
   *
   * `readerKey` porte la CLÉ DE CONNEXION, pas un `User.id` : c'est `userId`
   * pour un inscrit et `Participant.id` pour un invité de lien partagé — même
   * convention que la file (`enqueueForOfflineParticipants` enfile sous
   * `p.userId ?? p.id`), que `_dropEndedMemberships` et que
   * `_emitDeliveryForDrainedMessages`. La résolution lisait auparavant la seule
   * colonne `userId`, donc rendait ZÉRO ligne pour un invité, donc sortait en
   * silence ; le site d'appel enterrait le trou sous un `if (!isAnonymous)` qui
   * donnait l'omission pour délibérée. L'instantané de PRÉSENCE, dans la même
   * méthode appelante, résolvait pourtant déjà les deux identités correctement.
   *
   * Ça privait de pastille exacte la population DOMINANTE d'une conversation
   * ouverte par lien — et sans recours sur iOS/Android, qui n'ont aucun lecteur
   * pour `message:pending-delivered`.
   */
  private async _emitUnreadCountsSnapshot(
    socket: Socket,
    readerKey: string,
    isAnonymous: boolean
  ): Promise<void> {
    try {
      const participantRows = await this.prisma.participant.findMany({
        where: isAnonymous
          ? { id: readerKey, isActive: true }
          : { userId: readerKey, isActive: true },
        select: { conversationId: true },
      });
      if (participantRows.length === 0) return;

      // `lastMessageAt` ne sert PAS au compteur — il sert à borner la passe
      // de ponts ci-dessous sur les conversations que le lecteur va
      // réellement voir (cf. `BRIDGE_SNAPSHOT_LIMIT`). Il est lu À PART, et
      // jamais par la relation requise `participant.conversation` : une
      // adhésion dont la conversation a été supprimée (orpheline) faisait
      // lever Prisma (« Inconsistent query result: Field conversation is
      // required ») et perdait l'instantané ENTIER — 118 compteurs pour une
      // ligne de 2025, à chaque reconnexion, mesuré en prod le 2026-08-26.
      // L'orpheline est ignorée ici et signalée, pour le balayage de
      // maintenance qui la retirera.
      const liveConversations = await this.prisma.conversation.findMany({
        where: { id: { in: participantRows.map(p => p.conversationId) } },
        select: { id: true, lastMessageAt: true },
      });
      const liveConversationIds = new Set(liveConversations.map(c => c.id));
      const orphanConversationIds = participantRows
        .map(p => p.conversationId)
        .filter(id => !liveConversationIds.has(id));
      if (orphanConversationIds.length > 0) {
        logger.warn('unread snapshot: participations pointing to a missing conversation were skipped', {
          readerKey,
          isAnonymous,
          orphanConversationIds,
        });
      }
      const conversationIds = liveConversations.map(c => c.id);
      if (conversationIds.length === 0) return;
      // `getUnreadCountsForUser` résout DÉJÀ les deux identités en interne
      // (`OR: [{ id: userId }, { userId }]`) — c'est la lecture de participants
      // au-dessus qui ne connaissait qu'une colonne.
      const unreadCounts = await this.readStatusService.getUnreadCountsForUser(readerKey, conversationIds);

      // Le pont ✦ voyage sur CE même événement (G-123). Il manquait ici, et
      // l'omission n'était pas neutre : les deux clients recopient
      // INCONDITIONNELLEMENT `bridge`, `undefined`/`nil` compris
      // (`ConversationSyncEngine.handleUnreadUpdated`, et côté web
      // `setConversationUnreadInCache(..., { bridge: data.bridge })` depuis
      // REV-5/B1). La forme courte n'était donc pas un silence mais un ORDRE
      // D'EFFACEMENT : chaque reconnexion — bascule réseau, retour d'arrière-
      // plan, déploiement — retirait le pont de TOUTES les lignes du lecteur,
      // y compris celles où il a des non-lus et où le pont est précisément ce
      // qu'il cherche. Rien ne le remettait avant le prochain message reçu
      // (la liste web tourne en `staleTime: Infinity`).
      //
      // Passe par CONVERSATIONS (`buildBridgeData`) et non par lecteurs : ici
      // UN lecteur et N conversations, l'image miroir du fan-out d'envoi. Coût
      // CONSTANT, celui que `GET /conversations` paie déjà — jamais une passe
      // par conversation (le N+1 que REV-5/B2 a dû retirer du fan-out).
      //
      // Aucun `agent` (G-127) : l'étage agent reste réservé à
      // `GET /conversations`. Une reconnexion touche toutes les conversations
      // du lecteur d'un coup ; lui ouvrir un aller-retour HTTP par pont ferait
      // payer le réveil du réseau au moment exact où il est le plus fragile.
      // BORNÉE, et c'est la différence essentielle avec le fan-out d'envoi.
      // Le fan-out porte UNE conversation ; cet instantané en porte TOUTES
      // celles du lecteur — un compte qui suit 300 conversations soumettrait
      // 300 branches `OR` à la fenêtre du service, à chaque reconnexion, alors
      // que `GET /conversations` ne lui en soumet jamais plus d'une page.
      // Le tri est celui de la LISTE elle-même (`lastMessageAt` décroissant) :
      // les ponts construits sont exactement ceux des lignes que le lecteur a
      // sous les yeux au retour du réseau. Les conversations plus anciennes
      // gardent leur compteur exact — seul leur pont attend le prochain
      // `GET /conversations`, qui le rendra en même temps que leur ligne.
      const lastMessageAtByConversation = new Map(
        liveConversations.map(c => [c.id, c.lastMessageAt ?? null])
      );
      const bridgeCandidates = [...unreadCounts]
        .map(([conversationId, unreadCount]) => ({ conversationId, unreadCount }))
        .filter(candidate => candidate.unreadCount > 0)
        .sort(
          (a, b) =>
            (lastMessageAtByConversation.get(b.conversationId)?.getTime() ?? 0) -
            (lastMessageAtByConversation.get(a.conversationId)?.getTime() ?? 0)
        )
        .slice(0, BRIDGE_SNAPSHOT_LIMIT);

      // Les conversations RÉELLEMENT soumises à la passe. C'est cet ensemble —
      // et non le résultat de la passe — qui décide de la forme de fil
      // (cycle 63) : une conversation au-delà de la borne n'a pas été
      // interrogée, le serveur n'a donc RIEN à en dire.
      //
      // Sans cette distinction, la borne posée au cycle 62 ne différait PAS son
      // travail comme son commentaire l'annonçait (« seul leur pont attend le
      // prochain `GET /conversations` ») : elle l'ANNULAIT. Les conversations
      // hors page émettaient la forme courte, que les deux clients lisaient
      // comme un ordre d'effacement — si bien que le correctif du cycle 62
      // avait troqué un effacement GLOBAL contre un effacement de la QUEUE, à
      // chaque reconnexion, sans que son propre témoin puisse le voir : la
      // forme émise était identique dans les deux cas.
      const submittedToPass = new Set(bridgeCandidates.map(candidate => candidate.conversationId));

      let bridgeByConversation: ReadonlyMap<string, { bridge: ConversationBridge }> = new Map();
      let bridgePassRan = true;
      if (bridgeCandidates.length > 0) {
        try {
          bridgeByConversation = await this.bridgeService.buildBridgeData({
            viewerId: readerKey,
            candidates: bridgeCandidates,
          });
        } catch (error) {
          // Best-effort, même posture que le fan-out et que la liste REST : un
          // pont qui ne se calcule pas ne doit priver personne de sa pastille
          // — ni, depuis le cycle 63, du pont qu'il a déjà en cache.
          bridgePassRan = false;
          logger.warn('bridge attach failed on reconnect snapshot, serving counts alone', {
            readerKey,
            error,
          });
        }
      }

      for (const [conversationId, unreadCount] of unreadCounts) {
        // Un compteur à ZÉRO n'entre jamais dans la passe (contrat gelé §3.2),
        // et pourtant le serveur sait parfaitement qu'il n'a pas de pont : tout
        // a été lu. Il l'affirme, il ne s'abstient pas — sinon un pont périmé
        // survivrait à la lecture complète de sa conversation.
        const knowsThereIsNoBridge = unreadCount === 0;
        const answered = bridgePassRan && submittedToPass.has(conversationId);
        socket.emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
          conversationId,
          unreadCount,
          ...(knowsThereIsNoBridge || answered
            ? bridgeComputed(bridgeByConversation.get(conversationId)?.bridge)
            : bridgeNotComputed()),
        });
      }
    } catch (error) {
      logger.warn('unread counts snapshot failed on reconnect', { readerKey, isAnonymous, error });
    }
  }

  /**
   * Variante bulk pour minimiser les appels : retourne un Map<id, isOnline> pour les
   * ids fournis. Utile lors du formatting de listes (conversations, participants).
   */
  public getPresenceForIds(ids: readonly string[]): Map<string, boolean> {
    const out = new Map<string, boolean>();
    for (const id of ids) {
      out.set(id, this.connectedUsers.has(id));
    }
    return out;
  }

  /**
   * Liste les userIds actuellement online parmi un ensemble candidat (généralement
   * les participants des conversations de l'utilisateur authentifié). Utilisé pour
   * construire le snapshot `presence:snapshot` émis à l'auth.
   */
  public listOnlineAmong(candidateIds: readonly string[]): string[] {
    return candidateIds.filter(id => this.connectedUsers.has(id));
  }

  async initialize(): Promise<void> {
    try {
      // Initialiser le service de traduction
      await this.translationService.initialize();

      // Initialiser le PostTranslationService singleton (dépend de ZMQ client + socialEventsHandler)
      const zmqClient = this.translationService.getZmqClient();
      if (zmqClient) {
        PostTranslationService.init(this.prisma, zmqClient, this.socialEventsHandler);
      }

      // Initialiser le service de notifications avec Socket.IO
      this.notificationService.setSocketIO(this.io, this.userSockets);

      // Wire push notifications
      const pushService = new PushNotificationService(this.prisma);
      this.notificationService.setPushNotificationService(pushService);

      // Wire email for immediate high-priority notifications
      const emailService = new EmailService();
      this.notificationService.setEmailService(emailService);

      // Initialiser le service de notifications pour CallEventsHandler
      this.callEventsHandler.setNotificationService(this.notificationService);
      this.callEventsHandler.setPushNotificationService(pushService);
      if (zmqClient) {
        this.callEventsHandler.setZmqClient(zmqClient);
      }

      // Écouter les événements de transcription seule prêtes
      this.translationService.on('transcriptionReady', this._handleTranscriptionReady.bind(this));

      // Écouter les événements de traduction audio avec contexte sémantique
      this.translationService.on('audioTranslationReady', this._handleAudioTranslationReady.bind(this));  // Langue unique
      this.translationService.on('audioTranslationsProgressive', this._handleAudioTranslationsProgressive.bind(this));  // Progressive (multi)
      this.translationService.on('audioTranslationsCompleted', this._handleAudioTranslationsCompleted.bind(this));  // Dernière (multi)

      // Écouter les événements de traduction TEXTE
      this.translationService.on('translationReady', this._handleTextTranslationReady.bind(this));

      // Écouter les traductions de textObjects de story
      this.translationService.on('storyTextObjectTranslationCompleted', this._handleStoryTextObjectTranslationCompleted.bind(this));

      // Propager les erreurs de traduction aux clients — empêche les spinners "translating…" permanents
      this.translationService.on('translationFailed', this._handleTranslationFailed.bind(this));
      this.translationService.on('audioTranslationError', this._handleAudioTranslationFailed.bind(this));
      this.translationService.on('transcriptionError', this._handleTranscriptionFailed.bind(this));

      // Configurer les événements Socket.IO
      this._setupSocketEvents();

      // Relais Redis → room admin:agent (events des dashboards admin agent)
      this.agentAdminRelay = new AgentAdminRelay(this.io);
      this.agentAdminRelay.start().catch((error) => {
        logger.error('❌ Erreur démarrage AgentAdminRelay', error);
      });
      // ✅ FIX BUG #3: SUPPRIMER le polling périodique
      // Le système utilise maintenant uniquement les événements Socket.IO (connect/disconnect)
      // et le broadcast de statut lors de ces événements
      // this._ensureOnlineStatsTicker(); // ← SUPPRIMÉ

      // Démarrer les tâches de maintenance
      try {
        await this.maintenanceService.startMaintenanceTasks();
      } catch (error) {
        logger.error('❌ Erreur lors du démarrage des tâches de maintenance', error);
        logger.error('❌ Stack trace', error instanceof Error ? error.stack : 'No stack trace');
      }
      
      // Note: Les événements de traduction sont gérés via le singleton ZMQ
      
      
    } catch (error) {
      logger.error('❌ Erreur initialisation MeeshySocketIOManager', error);
      throw error;
    }
  }

  private _setupSocketEvents(): void {
    this.io.on('connection', (socket) => {
      this.stats.total_connections++;
      this.stats.active_connections++;
      logger.debug('socket connected', { socketId: socket.id, activeConnections: this.stats.active_connections });

      this.authHandler.handleTokenAuthentication(socket);

      socket.on(CLIENT_EVENTS.AUTHENTICATE, async (data) => {
        try { await this.authHandler.handleManualAuthentication(socket, data); } catch (error) { logger.error('[AUTHENTICATE] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.MESSAGE_SEND, async (data, callback) => {
        try { await this.messageHandler.handleMessageSend(socket, data, callback); } catch (error) { logger.error('[MESSAGE_SEND] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS, async (data, callback) => {
        try { await this.messageHandler.handleMessageSendWithAttachments(socket, data, callback); } catch (error) { logger.error('[MESSAGE_SEND_WITH_ATTACHMENTS] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.MESSAGE_EDIT, async (data, callback) => {
        try { await this.messageHandler.handleMessageEdit(socket, data, callback); } catch (error) { logger.error('[MESSAGE_EDIT] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.MESSAGE_DELETE, async (data, callback) => {
        try { await this.messageHandler.handleMessageDelete(socket, data, callback); } catch (error) { logger.error('[MESSAGE_DELETE] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.REQUEST_TRANSLATION, async (data: { messageId: string; targetLanguage: string }) => {
        // Rate limit: 10 requêtes/min par userId (multi-device inclus) pour éviter la saturation ZMQ
        const translationUserId = this.socketToUser.get(socket.id);
        if (!translationUserId) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'Not authenticated' });
          return;
        }
        const rateLimitKey = `translation_request:${translationUserId}`;
        const now = Date.now();
        const windowMs = 60_000;
        const maxRequests = 10;
        const existing = this.socketRateLimits.get(rateLimitKey) ?? [];
        const recent = existing.filter(t => now - t < windowMs);
        if (recent.length >= maxRequests) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'Rate limit exceeded for translation requests' });
          return;
        }
        this.socketRateLimits.set(rateLimitKey, [...recent, now]);
        try { await this._handleTranslationRequest(socket, data); } catch (error) { logger.error('[REQUEST_TRANSLATION] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.CONVERSATION_JOIN, async (data) => {
        try { await this.conversationHandler.handleConversationJoin(socket, data); } catch (error) { logger.error('[CONVERSATION_JOIN] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.CONVERSATION_LEAVE, async (data) => {
        try { await this.conversationHandler.handleConversationLeave(socket, data); } catch (error) { logger.error('[CONVERSATION_LEAVE] Error:', error); }
      });

      this.callEventsHandler.setupCallEvents(
        socket,
        this.io,
        (socketId: string) => this.socketToUser.get(socketId),
        (socketId: string) => {
          const userId = this.socketToUser.get(socketId);
          if (!userId) return undefined;
          const user = this.connectedUsers.get(userId);
          if (!user) return undefined;
          return { id: user.id, isAnonymous: user.isAnonymous };
        }
      );

      socket.on(CLIENT_EVENTS.FEED_SUBSCRIBE, async (callback?: (response: SocketIOResponse) => void) => {
        try {
          const userId = this.socketToUser.get(socket.id);
          if (!userId) {
            callback?.({ success: false, error: 'Not authenticated' });
            return;
          }
          await this.socialEventsHandler.handleFeedSubscribe(socket, userId);
          callback?.({ success: true });
        } catch (error) {
          logger.error('[FEED_SUBSCRIBE] Error:', error);
          callback?.({ success: false, error: 'Failed to subscribe to feed' });
        }
      });

      socket.on(CLIENT_EVENTS.FEED_UNSUBSCRIBE, async (callback?: (response: SocketIOResponse) => void) => {
        try {
          const userId = this.socketToUser.get(socket.id);
          if (!userId) {
            callback?.({ success: false, error: 'Not authenticated' });
            return;
          }
          await this.socialEventsHandler.handleFeedUnsubscribe(socket, userId);
          callback?.({ success: true });
        } catch (error) {
          logger.error('[FEED_UNSUBSCRIBE] Error:', error);
          callback?.({ success: false, error: 'Failed to unsubscribe from feed' });
        }
      });

      socket.on(CLIENT_EVENTS.TYPING_START, (data) => {
        this.statusHandler.handleTypingStart(socket, data).catch((error) => logger.error('[TYPING_START] Error:', error));
      });

      socket.on(CLIENT_EVENTS.TYPING_STOP, (data) => {
        this.statusHandler.handleTypingStop(socket, data).catch((error) => logger.error('[TYPING_STOP] Error:', error));
      });

      socket.on(CLIENT_EVENTS.HEARTBEAT, (data?: { clientTime?: number }) => {
        this.authHandler.handleHeartbeat(socket, data).catch((error) => logger.error('[HEARTBEAT] Error:', error));
      });

      // Engine-level pong: couvre les clients SANS heartbeat applicatif
      // (Android) — un connecté-passif reste 'online' sous la garde 5 min.
      socket.conn.on('packet', (packet: { type?: string }) => {
        if (packet?.type !== 'pong') return;
        this.authHandler.handleEnginePong(socket);
      });

      socket.on(CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE, (callback?: (response: SocketIOResponse) => void) => {
        this.adminAgentHandler.handleSubscribe(socket, callback).catch((error) => logger.error('[ADMIN_AGENT_SUBSCRIBE] Error:', error));
      });

      socket.on(CLIENT_EVENTS.ADMIN_AGENT_UNSUBSCRIBE, (callback?: (response: SocketIOResponse) => void) => {
        try {
          this.adminAgentHandler.handleUnsubscribe(socket, callback);
        } catch (error) {
          logger.error('[ADMIN_AGENT_UNSUBSCRIBE] Error:', error);
          callback?.({ success: false, error: 'Internal server error' });
        }
      });

      socket.on(CLIENT_EVENTS.REACTION_ADD, async (data, callback) => {
        try { await this.reactionHandler.handleReactionAdd(socket, data, callback); } catch (error) { logger.error('[REACTION_ADD] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.REACTION_REMOVE, async (data, callback) => {
        try { await this.reactionHandler.handleReactionRemove(socket, data, callback); } catch (error) { logger.error('[REACTION_REMOVE] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.REACTION_REQUEST_SYNC, async (messageId, callback) => {
        try { await this.reactionHandler.handleReactionSync(socket, messageId, callback); } catch (error) { logger.error('[REACTION_SYNC] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.ATTACHMENT_REACTION_ADD, async (data, callback) => {
        try { await this.attachmentReactionHandler.handleAdd(socket, data, callback); } catch (error) { logger.error('[ATTACHMENT_REACTION_ADD] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE, async (data, callback) => {
        try { await this.attachmentReactionHandler.handleRemove(socket, data, callback); } catch (error) { logger.error('[ATTACHMENT_REACTION_REMOVE] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.COMMENT_REACTION_ADD, async (data, callback) => {
        try { await this.commentReactionHandler.handleAddReaction(socket, data, callback); } catch (error) { logger.error('[COMMENT_REACTION_ADD] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.COMMENT_REACTION_REMOVE, async (data, callback) => {
        try { await this.commentReactionHandler.handleRemoveReaction(socket, data, callback); } catch (error) { logger.error('[COMMENT_REACTION_REMOVE] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.COMMENT_REACTION_REQUEST_SYNC, async (data, callback) => {
        try { await this.commentReactionHandler.handleRequestSync(socket, data, callback); } catch (error) { logger.error('[COMMENT_REACTION_SYNC] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.JOIN_POST, async (data, callback) => {
        try { await this.postReactionHandler.handleJoinPost(socket, data, callback); } catch (error) { logger.error('[JOIN_POST] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.LEAVE_POST, async (data, callback) => {
        try { await this.postReactionHandler.handleLeavePost(socket, data, callback); } catch (error) { logger.error('[LEAVE_POST] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.POST_REACTION_ADD, async (data, callback) => {
        try { await this.postReactionHandler.handleAddReaction(socket, data, callback); } catch (error) { logger.error('[POST_REACTION_ADD] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.POST_REACTION_REMOVE, async (data, callback) => {
        try { await this.postReactionHandler.handleRemoveReaction(socket, data, callback); } catch (error) { logger.error('[POST_REACTION_REMOVE] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.POST_REACTION_REQUEST_SYNC, async (data, callback) => {
        try { await this.postReactionHandler.handleRequestSync(socket, data, callback); } catch (error) { logger.error('[POST_REACTION_SYNC] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_LIVE_START, async (data, callback) => {
        try { await this.locationHandler.handleLiveLocationStart(socket, data, callback); } catch (error) { logger.error('[LOCATION_LIVE_START] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_LIVE_UPDATE, async (data) => {
        try { await this.locationHandler.handleLiveLocationUpdate(socket, data); } catch (error) { logger.error('[LOCATION_LIVE_UPDATE] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_LIVE_STOP, async (data) => {
        try { await this.locationHandler.handleLiveLocationStop(socket, data); } catch (error) { logger.error('[LOCATION_LIVE_STOP] Error:', error); }
      });

      socket.on('disconnecting', (_reason: string) => {
        // Retrait des partages de position portés par CE socket. Ici et pas dans
        // `disconnect` : la diffusion vise les rooms de la conversation, et
        // `disconnect` s'exécute après en être sorti. Synchrone et hors du
        // `if (disconnectingUserId)` — le registre porte lui-même l'identité du
        // partageur, il n'a pas besoin d'une table qui, elle, peut déjà avoir
        // été vidée.
        this.locationHandler.handleSocketDisconnecting(socket.id);

        const disconnectingUserId = this.socketToUser.get(socket.id);
        if (disconnectingUserId) {
          // Build the set of OTHER sockets for this user (excluding the one
          // that is disconnecting). Passed to handleSocketDisconnecting so it
          // can suppress typing:stop broadcasts for conversations where the
          // user is still typing on another device — prevents false indicator
          // flicker when a user has multiple active sessions.
          const allUserSockets = this.userSockets.get(disconnectingUserId) ?? new Set<string>();
          const otherSocketIds = new Set([...allUserSockets].filter(sid => sid !== socket.id));
          void this.statusHandler.handleSocketDisconnecting(
            socket.id,
            (room, event, data, exceptSocketIds) => {
              // event is always SERVER_EVENTS.TYPING_STOP — cast bypasses union exhaustiveness check
              const emitter = exceptSocketIds && exceptSocketIds.length > 0
                ? this.io.to(room).except(exceptSocketIds)
                : this.io.to(room);
              emitter.emit(event as keyof ServerToClientEvents, data as any);
            },
            otherSocketIds.size > 0 ? otherSocketIds : undefined
          ).catch((error) => {
            // Defense-in-depth: handleSocketDisconnecting already swallows its
            // own failures, but keep the fire-and-forget call symmetric with
            // every other `void`-launched handler here (all attach .catch) so a
            // future refactor can never leak an unhandled rejection.
            logger.error('handleSocketDisconnecting failed', { error, socketId: socket.id });
          });
        }
      });

      socket.on('disconnect', (reason: string) => {
        logger.debug('socket disconnect', { socketId: socket.id, reason });
        const disconnectedUserId = this.socketToUser.get(socket.id);
        if (disconnectedUserId) {
          // typing:stop-on-disconnect is broadcast exclusively by the
          // 'disconnecting' handler above (StatusHandler.handleSocketDisconnecting):
          // it is the authoritative path — per-socket precision (activeTypers),
          // multi-device suppression (no false stop when another device is still
          // typing), blocked-viewer exclusion, and throttle-map cleanup. Emitting
          // again here from the per-user throttle map re-broadcast the stop
          // without any of those guarantees, producing duplicate and false
          // typing:stop events on multi-device disconnects.
          this.statusHandler.invalidateIdentityCache(disconnectedUserId);
          // Invalider le snapshot de présence pour forcer un recalcul à la prochaine connexion
          this.presenceSnapshotCache.delete(disconnectedUserId);
          // Nettoyage du rate limiter in-memory (keyed by userId — purge si dernier socket)
          // Note: socket.id est encore dans userSockets ici (authHandler.handleDisconnection
          // n'a pas encore tourné), donc size === 1 signifie "dernier socket de cet user".
          const remainingUserSockets = this.userSockets.get(disconnectedUserId);
          if (!remainingUserSockets || remainingUserSockets.size <= 1) {
            this.socketRateLimits.delete(`translation_request:${disconnectedUserId}`);
          }
        }
        this.authHandler.handleDisconnection(socket).catch((error) => logger.error('[DISCONNECT] Error:', error));
        this.stats.active_connections--;
      });
    });
  }


  private async _handleTranslationRequest(socket: Socket, data: { messageId: string; targetLanguage: string }) {
    try {
      const userId = this.socketToUser.get(socket.id);
      if (!userId) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'User not authenticated' });
        return;
      }
      
      
      // Charger le message pour connaître sa conversation, PUIS vérifier
      // l'appartenance AVANT de servir toute traduction (cache OU on-demand).
      // Sans cette garde en amont, la branche cache divulguait le contenu
      // traduit à un non-participant : le contrôle n'existait que côté on-demand,
      // donc un message déjà mis en cache fuitait vers n'importe quel socket
      // connaissant son id (IDOR / message-content disclosure).
      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { id: true, conversationId: true, content: true, originalLanguage: true, senderId: true, encryptionMode: true }
      });

      if (!message || !message.content) {
        socket.emit(SERVER_EVENTS.ERROR, {
          message: 'Message not found or empty'
        });
        return;
      }

      // Verify requesting user is a participant of the message's conversation
      const connectedUser = this.connectedUsers.get(userId);
      const membershipCheck = connectedUser?.isAnonymous
        ? await this.prisma.participant.findFirst({
            where: { id: connectedUser.participantId, conversationId: message.conversationId, isActive: true },
            select: { id: true },
          })
        : await this.prisma.participant.findFirst({
            where: { userId, conversationId: message.conversationId, isActive: true },
            select: { id: true },
          });

      if (!membershipCheck) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'Access denied' });
        return;
      }

      // Récupérer la traduction (depuis le cache ou la base de données)
      const translation = await this.translationService.getTranslation(data.messageId, data.targetLanguage);

      if (translation) {
        // MÊME constructeur que le retour ZMQ (`_handleTextTranslationReady`).
        // Cette branche émettait sa propre forme — `{ messageId, translatedText,
        // targetLanguage, confidenceScore }` — que ni le web (qui exige
        // `translation`/`translations` et sort en silence sinon) ni iOS (qui
        // décode `TranslationEvent`, `translations` non optionnel) ne sait lire.
        // « Traduire ce message » ne faisait donc RIEN dès que la traduction
        // était en cache, c'est-à-dire sur le chemin instantané ; elle ne
        // « marchait » que sur cache MISS, servie par l'autre constructeur.
        socket.emit(SERVER_EVENTS.MESSAGE_TRANSLATION, buildTranslationEvent({
          messageId: data.messageId,
          targetLanguage: data.targetLanguage,
          translatedText: translation.translatedText,
          sourceLanguage: translation.sourceLanguage,
          translationModel: translation.translatorModel || translation.modelType,
          confidenceScore: translation.confidenceScore,
          cached: true,
        }));

        this.stats.translations_sent++;

      } else {
        // No cached translation — trigger on-demand translation via ZMQ
        try {
          await this.translationService.handleNewMessage({
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId ?? undefined,
            content: message.content,
            originalLanguage: message.originalLanguage ?? 'auto',
            targetLanguage: data.targetLanguage,
            encryptionMode: message.encryptionMode as MessageData['encryptionMode'],
          });

          logger.info(`🔄 On-demand translation requested for message ${data.messageId} -> ${data.targetLanguage}`);
        } catch (translationError) {
          logger.error(`❌ On-demand translation failed: ${translationError}`);
          socket.emit(SERVER_EVENTS.ERROR, {
            message: 'Translation request failed'
          });
        }
      }
      
    } catch (error) {
      logger.error(`❌ Erreur demande traduction: ${error}`);
      this.stats.errors++;
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Failed to get translation' });
    }
  }

  private _handleTranslationFailed(data: TranslationFailedEventData): void {
    try {
      const room = ROOMS.conversation(data.conversationId);
      this.io.to(room).emit(SERVER_EVENTS.TRANSLATION_FAILED, data);
      logger.warn('translation:failed broadcast', {
        messageId: data.messageId,
        conversationId: data.conversationId,
        error: data.error,
      });
    } catch (error) {
      logger.error('failed to broadcast translation:failed', { data, error });
    }
  }

  private async _handleAudioTranslationFailed(data: {
    taskId?: string;
    messageId: string;
    attachmentId: string;
    error: string;
    errorCode?: string;
  }): Promise<void> {
    try {
      const msg = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { conversationId: true },
      });
      if (!msg) return;
      const payload: AudioTranslationFailedEventData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: msg.conversationId,
        error: data.error,
        errorCode: data.errorCode,
        taskId: data.taskId,
      };
      this.io.to(ROOMS.conversation(msg.conversationId)).emit(SERVER_EVENTS.AUDIO_TRANSLATION_FAILED, payload);
      logger.warn('audio:translation-failed broadcast', {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: msg.conversationId,
        error: data.error,
      });
    } catch (error) {
      logger.error('failed to broadcast audio:translation-failed', { data, error });
    }
  }

  private async _handleTranscriptionFailed(data: {
    taskId?: string;
    messageId: string;
    attachmentId: string;
    error: string;
    errorCode?: string;
  }): Promise<void> {
    try {
      const msg = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { conversationId: true },
      });
      if (!msg) return;
      const payload: TranscriptionFailedEventData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: msg.conversationId,
        error: data.error,
        errorCode: data.errorCode,
        taskId: data.taskId,
      };
      this.io.to(ROOMS.conversation(msg.conversationId)).emit(SERVER_EVENTS.TRANSCRIPTION_FAILED, payload);
      logger.warn('audio:transcription-failed broadcast', {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: msg.conversationId,
        error: data.error,
      });
    } catch (error) {
      logger.error('failed to broadcast audio:transcription-failed', { data, error });
    }
  }

  /**
   * @deprecated Cette fonction gère les anciennes traductions de texte (non audio).
   * Les nouvelles traductions audio utilisent _handleAudioTranslationReady et variants.
   */
  private async _handleTextTranslationReady(data: { taskId: string; result: any; targetLanguage: string; translationId?: string; id?: string }) {
    try {
      const { result, targetLanguage} = data;

      // Une traduction de post/commentaire/story emprunte le même bus que celle
      // d'un message, sous un identifiant namespacé (`post:<id>`) : elle n'a ni
      // ligne `Message`, ni room de conversation. La chercher ici envoyait
      // `post:<24-hex>` à Prisma comme ObjectId (P2023) puis loggait un « No
      // conversation found » alarmant pour un cas parfaitement normal — le
      // broadcast social est fait par `SocialEventsHandler`.
      if (!isMessageTranslationTarget(result?.messageId ?? '')) {
        return;
      }

      // Récupérer la conversation du message pour broadcast
      let conversationIdForBroadcast: string | null = null;
      // `senderId` ne sert qu'à remplir `updatedBy`, OBLIGATOIRE dans
      // ConversationUpdatedEventData, sur le rafraîchissement d'aperçu ci-dessous.
      // Une traduction n'a pas d'acteur humain : l'auteur du message traduit est
      // la seule identité honnête à porter là, et c'est déjà le repli que le
      // chemin d'envoi utilise (`senderUserId ?? message.senderId`). La colonne
      // est non-nullable et la ligne a forcément été lue quand on arrive au
      // rafraîchissement — `conversationIdForBroadcast` sort du MÊME `msg`.
      let senderIdForPreview = '';
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: result.messageId },
          select: { conversationId: true, senderId: true }
        });
        conversationIdForBroadcast = msg?.conversationId || null;
        senderIdForPreview = msg?.senderId ?? '';
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation:`, error);
      }
      
      // Préparer les données de traduction au format correct pour le frontend
      // FORMAT: TranslationEvent avec un tableau de traductions
      const translationData: TranslationEvent = buildTranslationEvent({
        messageId: result.messageId,
        targetLanguage,
        translatedText: result.translatedText,
        sourceLanguage: result.sourceLanguage,
        translationModel: result.translationModel || result.modelType,
        confidenceScore: result.confidenceScore,
        cached: false,
        translationId: data.translationId || data.id,
      });
      
      
      // Diffuser dans la room de conversation (méthode principale et UNIQUE)
      if (conversationIdForBroadcast) {
        // Normaliser l'ID de conversation
        const normalizedId = await this.normalizeConversationId(conversationIdForBroadcast);
        const roomName = ROOMS.conversation(normalizedId);
        const roomClients = this.io.sockets.adapter.rooms.get(roomName);
        const clientCount = roomClients ? roomClients.size : 0;
        
        
        this.io.to(roomName).emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
        this.stats.translations_sent += clientCount;

        // Troisième audience, la seule que rien ne servait : les participants
        // HORS LIGNE à l'instant où NLLB répond. La room ne contient que des
        // sockets connectées, et le `message:new` mis en file à l'ENVOI porte
        // `translations: []` — la traduction atterrit une seconde plus tard, par
        // ZMQ. Sans cette entrée, le message rejoué au reconnect reste
        // définitivement dans la langue de l'expéditeur : aucun client ne
        // refetch spontanément. Le Prisme devenait fonction de la CONNECTIVITÉ
        // du lecteur — exactement le défaut que `emitAttachmentUpdated` ferme
        // pour la transcription d'une note vocale, ici pour le texte.
        //
        // Aucun acteur à exclure : NLLB n'est pas une personne, et l'auteur du
        // message est précisément un participant dont la copie ne porte aucune
        // traduction à l'envoi.
        //
        // `dedupKey` scopé à la LANGUE CIBLE : un message se traduit vers autant
        // de langues que la conversation compte de langues de lecture, et
        // l'identité de dédup par défaut (messageId, eventType) les écraserait
        // l'une après l'autre — le lecteur hors ligne ne convergerait que sur la
        // dernière arrivée.
        // Borné aux lecteurs dont le Prisme porte CETTE langue — la même règle
        // que `emitConversationPreviewUpdate` applique juste en dessous avec
        // `onlyIfPreviewCarriesLanguage`. Sans ce bornage, un message d'une
        // conversation à L langues déposait L entrées chez CHAQUE absent, dont
        // L−1 dans des langues qu'il ne peut pas afficher : la file qui porte
        // les vrais messages était diluée d'autant, et le repli mémoire
        // (plafonné à 50 entrées par utilisateur) évinçait des messages réels
        // au profit de traductions illisibles.
        await this._enqueueForOfflineParticipants({
          conversationId: normalizedId,
          eventType: 'translation',
          messageId: result.messageId,
          payload: translationData,
          dedupKey: `${result.messageId}:${targetLanguage}`,
          restrictToReadersOfLanguage: targetLanguage,
        });

        // `message:translation` ne porte QUE la room de conversation. Un lecteur
        // resté sur l'écran de liste n'y apprend rien : sa ligne garde l'aperçu
        // servi à l'ENVOI, quand aucune traduction n'existait encore, et rien ne
        // repasse jamais. Le Prisme devenait donc fonction de l'ordre d'arrivée —
        // ouvrir la conversation traduisait la ligne, ne pas l'ouvrir la laissait
        // dans la langue de l'expéditeur, indéfiniment.
        //
        // Borné aux deux seuls cas où la ligne change VRAIMENT : le message
        // traduit est encore le dernier de la conversation, et le destinataire
        // lit la langue qui vient d'atterrir (cf. `PreviewUpdateScope`).
        await emitConversationPreviewUpdate(
          this.prisma,
          this.io,
          normalizedId,
          senderIdForPreview,
          (error) => logger.warn('preview refresh after translation failed (best-effort)', {
            messageId: result.messageId,
            targetLanguage,
            error,
          }),
          { onlyIfLatestIs: result.messageId, onlyIfPreviewCarriesLanguage: targetLanguage },
        );
      } else {
        logger.warn(`⚠️ [SocketIOManager] No conversation found for message ${result.messageId} — translation dropped (no room to broadcast to)`);
      }

    } catch (error) {
      logger.error(`❌ Erreur envoi traduction: ${error}`);
      this.stats.errors++;
    }
  }

  /**
   * Gère la réception d'une traduction de textObject de story complétée.
   * Délègue au StoryTextObjectTranslationService qui persiste et émet via Socket.IO.
   */
  private async _handleStoryTextObjectTranslationCompleted(data: {
    postId: string;
    textObjectIndex: number;
    translations: Record<string, string>;
  }): Promise<void> {
    try {
      await StoryTextObjectTranslationService.shared.handleTranslationCompleted(data);
    } catch (error) {
      logger.error(`❌ [SocketIOManager] StoryTextObject translation handler error:`, error);
    }
  }

  /**
   * Gère la réception d'une transcription seule prête depuis le Translator
   * Diffuse l'événement TRANSCRIPTION_READY aux clients de la conversation
   * Utilisé lorsque seule la transcription est demandée, sans génération d'audios traduits
   */
  private async _handleTranscriptionReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    transcription: {
      id: string;
      text: string;
      language: string;
      confidence?: number;
      source?: string;
      segments?: Array<{ text: string; startMs: number; endMs: number; confidence?: number }>;
      durationMs?: number;
      speakerCount?: number;
      primarySpeakerId?: string;
      senderVoiceIdentified?: boolean;
      senderSpeakerId?: string | null;
    };
    processingTimeMs?: number;
    postId?: string;
    postMediaId?: string;
  }) {
    try {
      // Route post audio transcriptions to PostAudioService — skip message broadcast logic
      if (data.postId && data.postMediaId) {
        await PostAudioService.shared.handleTranscriptionReady({
          postId: data.postId,
          postMediaId: data.postMediaId,
          transcription: data.transcription,
        });
        return;
      }

      logger.debug(`transcription:ready msg=${data.messageId} attach=${data.attachmentId} lang=${data.transcription.language} segments=${data.transcription.segments?.length ?? 0}`);

      // Récupérer la conversation du message pour broadcast
      let conversationId: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        conversationId = msg?.conversationId || null;
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation pour transcription:`, error);
      }

      if (!conversationId) {
        logger.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${data.messageId}`);
        return;
      }

      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(conversationId);
      const roomName = ROOMS.conversation(normalizedId);
      const roomClients = this.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;

      logger.debug(`transcription:ready room=${roomName} clients=${clientCount}`);

      // Préparer les données au format TranscriptionReadyEventData
      const transcriptionData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: normalizedId,
        transcription: data.transcription,
        processingTimeMs: data.processingTimeMs
      };

      // Diffuser dans la room de conversation
      this.io.to(roomName).emit(SERVER_EVENTS.TRANSCRIPTION_READY, transcriptionData);
      logger.info('transcription:ready broadcast', { messageId: data.messageId, attachmentId: data.attachmentId, conversationId: normalizedId, lang: data.transcription.language });

      // Generic attachment-updated delta : clients atomically replace the
      // attachment in their store and refresh derived metadata
      // (transcription dictionaries, audio language listings) without a
      // round-trip. See spec 2026-05-25-audio-instant-render-and-attachment-size-design.md.
      await this._broadcastAttachmentUpdated(data.attachmentId, data.messageId, normalizedId);

    } catch (error) {
      logger.error(`❌ [SocketIOManager] Erreur envoi transcription:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Re-fetch a freshly-enriched attachment from the DB and broadcast a
   * `message:attachment-updated` delta to the conversation room. Used by
   * the transcription and translation handlers so iOS / web can refresh
   * their attachment state atomically without a manual REST round-trip.
   *
   * No-op (logged) if the attachment cannot be re-fetched.
   */
  private async _broadcastAttachmentUpdated(
    attachmentId: string,
    messageId: string,
    normalizedConversationId: string
  ): Promise<void> {
    try {
      const fresh = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: attachmentMediaSelect,
      });
      if (!fresh) {
        logger.warn(`⚠️ [SocketIOManager] Cannot broadcast attachment-updated: attachment ${attachmentId} not found`);
        return;
      }
      await emitAttachmentUpdated({
        io: this.io,
        prisma: this.prisma,
        deliveryQueue: this.deliveryQueue,
        connectedUsers: this.connectedUsers,
        conversationId: normalizedConversationId,
        messageId,
        attachment: fresh as Record<string, unknown>,
      });
    } catch (err) {
      logger.error(`❌ [SocketIOManager] Failed to broadcast attachment-updated for ${attachmentId}:`, err);
    }
  }

  /**
   * Gère la réception d'une traduction individuelle prête depuis le Translator (PROGRESSIVE)
   * @deprecated Utilisez _handleAudioTranslationReady, _handleAudioTranslationsProgressive ou _handleAudioTranslationsCompleted
   * Délègue au helper générique avec un événement générique
   */

  /**
   * Helper générique pour broadcaster les événements de traduction audio.
   */
  private async _broadcastTranslationEvent(
    data: AudioTranslationEventData & { taskId?: string; phase?: string; transcription?: unknown },
    eventName: string,
    eventConstant:
      | typeof SERVER_EVENTS.AUDIO_TRANSLATION_READY
      | typeof SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE
      | typeof SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED,
    logPrefix: string
  ) {
    try {
      logger.debug(`${logPrefix} audio-translation:ready msg=${data.messageId} attach=${data.attachmentId} lang=${data.language} segments=${data.translatedAudio?.segments?.length ?? 0}`);

      // Récupérer la conversation du message pour broadcast
      let conversationId: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        conversationId = msg?.conversationId || null;
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation pour traduction:`, error);
      }

      if (!conversationId) {
        logger.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${data.messageId}`);
        return;
      }

      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(conversationId);
      const roomName = ROOMS.conversation(normalizedId);
      const roomClients = this.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;

      logger.debug(`audio-translation:ready room=${roomName} clients=${clientCount} lang=${data.language}`);

      // Vérifier que translatedAudio existe
      if (!data.translatedAudio) {
        logger.error(`❌ [SocketIOManager] data.translatedAudio est undefined pour ${data.messageId}`);
        return;
      }

      // Préparer les données au format structure officielle de shared
      // Note: AudioTranslationReadyEventData, AudioTranslationsProgressiveEventData, AudioTranslationsCompletedEventData
      // sont des type aliases de AudioTranslationEventData, donc on peut utiliser n'importe lequel
      const translationData: import('@meeshy/shared/types/socketio-events').AudioTranslationEventData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: normalizedId,
        language: data.language || data.translatedAudio.targetLanguage,
        translatedAudio: {
          id: data.translatedAudio.id || `${data.attachmentId}_${data.language}`,
          targetLanguage: data.translatedAudio.targetLanguage || data.language,
          url: data.translatedAudio.url,
          transcription: (data.translatedAudio as unknown as { translatedText?: string }).translatedText || data.translatedAudio.transcription || '',
          durationMs: data.translatedAudio.durationMs || (data.translatedAudio as unknown as { duration?: number }).duration || 0,
          format: data.translatedAudio.format || 'mp3',
          cloned: data.translatedAudio.cloned || false,
          quality: data.translatedAudio.quality || 0,
          voiceModelId: data.translatedAudio.voiceModelId,
          ttsModel: data.translatedAudio.ttsModel || 'xtts',
          segments: data.translatedAudio.segments
        },
        processingTimeMs: data.phase ? undefined : 0
      };

      if (!translationData.translatedAudio.segments?.length) {
        logger.debug(`audio-translation:ready no segments lang=${data.language} msg=${data.messageId}`);
      }

      // Diffuser dans la room de conversation
      // Nom d'événement CALCULÉ : socket.io ne le vérifie PAS (mesure du
      // cycle 104 — sur un `Ev` union, `EventParams` s'effondre en union de
      // tuples et n'importe quelle charge de la famille passe sous n'importe
      // quel membre). Ce site AVAIT l'air gardé — il émet sur un `Server`
      // paramétré par `ServerToClientEvents` — et ne l'était pas.
      emitServerEvent(this.io.to(roomName), eventConstant, translationData);
      logger.info('audio-translation:ready broadcast', { messageId: data.messageId, attachmentId: data.attachmentId, conversationId: normalizedId, lang: data.language });

      // Generic attachment-updated delta : same rationale as the
      // transcription-ready branch. Clients receive the FULL re-serialized
      // attachment (with the freshly-added translation language merged into
      // `translations`) and refresh their derived state atomically.
      await this._broadcastAttachmentUpdated(data.attachmentId, data.messageId, normalizedId);

    } catch (error) {
      logger.error(`❌ [SocketIOManager] Erreur envoi traduction:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Gère un événement de traduction audio unique (1 seule langue demandée).
   * Format unifié: translatedAudio (singulier) — cohérent avec progressive/completed.
   */
  private async _handleAudioTranslationReady(data: AudioTranslationEventData & { taskId?: string; transcription?: unknown; phase?: string }) {
    if (!data.translatedAudio) {
      logger.error(`❌ [SocketIOManager] _handleAudioTranslationReady: translatedAudio manquant`, {
        keys: Object.keys(data),
        messageId: data.messageId
      });
      return;
    }

    await this._broadcastTranslationEvent(
      data,
      'audioTranslationReady',
      SERVER_EVENTS.AUDIO_TRANSLATION_READY,
      '🎯'
    );
  }

  /**
   * Gère un événement de traduction progressive (multi-langues, pas la dernière).
   * Format unifié: translatedAudio (singulier).
   */
  private async _handleAudioTranslationsProgressive(data: AudioTranslationEventData & { taskId?: string; phase?: string }) {
    await this._broadcastTranslationEvent(
      data,
      'audioTranslationsProgressive',
      SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE,
      '🔄'
    );
  }

  /**
   * Gère un événement de dernière traduction terminée (multi-langues).
   * Format unifié: translatedAudio (singulier).
   */
  private async _handleAudioTranslationsCompleted(data: AudioTranslationEventData & { taskId?: string; phase?: string }) {
    await this._broadcastTranslationEvent(
      data,
      'audioTranslationsCompleted',
      SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED,
      '✅'
    );
  }

  /**
   * Phase B1 — emit `message:new` to a conversation room grouped by each
   * recipient's preferred language, sending a translation-trimmed payload once
   * per distinct language. Recipients whose language is unknown fall back to the
   * message's original language. Opt-in via `SOCKET_LANG_FILTER=true` (OFF by
   * default). Pure trimming is
   * delegated to `filterMessagePayloadForLanguages` (unit-tested).
   */
  private _emitMessageNewByLanguage(
    room: string,
    payload: Record<string, any>,
    opts: { excludeUserId?: string } = {}
  ): void {
    // `adapter.rooms` + `connectedUsers`/`socketToUser` only see THIS node's
    // sockets. On a multi-node deployment (the 100k+ msg/s topology runs the
    // Socket.IO Redis adapter) a recipient on another gateway node is never
    // enumerated here, so the per-language loop below — which can only resolve
    // locally-connected sockets — would silently never deliver `message:new` to
    // them. Broadcast the FULL payload to the room across the cluster first (the
    // Redis adapter propagates `io.to(room)`), excepting every LOCAL room socket
    // (each served a trimmed copy by the loop). Remote sockets get exactly one
    // (unfiltered) message:new; local sockets get exactly one trimmed copy. On a
    // single node every room socket is local, so the except-set covers the whole
    // room and this broadcast reaches nobody — behavior unchanged.
    //
    // `excludeUserId` retire en plus la room personnelle de l'expéditeur : elle
    // reçoit le payload cid-aware par une émission séparée, et une copie
    // cid-strippée ici lui en ferait recevoir deux (miroir exact de
    // `MessageHandler._emitMessageNewByLanguage`).
    const localSocketIds = this.io.sockets.adapter.rooms.get(room);
    const exceptForRemote: string[] = localSocketIds ? [...localSocketIds] : [];
    if (opts.excludeUserId) exceptForRemote.push(ROOMS.user(opts.excludeUserId));
    const remoteEmitter: ReturnType<SocketIOServer['to']> = this.io
      .to(room)
      .except(exceptForRemote);
    remoteEmitter.emit(SERVER_EVENTS.MESSAGE_NEW, payload);

    if (!localSocketIds || localSocketIds.size === 0) return;

    // Delegate the per-recipient language grouping to the shared, unit-tested
    // `groupSocketsByLanguage` helper — exactly like `MessageHandler`'s twin
    // path. The helper normalizes every recipient language AND the original via
    // the shared `normalizeLanguageCode` SSOT (`'pt-BR' → 'pt'`), so a stored
    // translation keyed on the 2-letter code is never pruned for an anonymous
    // recipient carrying a raw BCP-47 `language` (Prisme Linguistique). The
    // previous inline grouping only `.toLowerCase()`d the language, leaving
    // `'pt-br'` un-matched against the `'pt'` translation key — a silent Prisme
    // regression on this REST/ZMQ broadcast path that the socket `message:send`
    // path (already delegating) never had.
    const originalLanguage = String(payload.originalLanguage || 'fr');
    const groups = groupSocketsByLanguage({
      socketIds: localSocketIds,
      originalLanguage,
      excludeUserId: opts.excludeUserId,
      socketToUser: (sid) => this.socketToUser.get(sid),
      resolveLanguages: (uid) => this.connectedUsers.get(uid)?.resolvedLanguages,
      userLanguage: (uid) => this.connectedUsers.get(uid)?.language,
    });

    for (const group of groups) {
      if (group.socketIds.length === 0) continue;
      const filtered = filterMessagePayloadForLanguages(payload, group.languages);
      const [firstSid, ...restSids] = group.socketIds;
      let emitter: ReturnType<SocketIOServer['to']> = this.io.to(firstSid);
      for (const socketId of restSids) emitter = emitter.to(socketId);
      emitter.emit(SERVER_EVENTS.MESSAGE_NEW, filtered);
    }
  }

  /**
   * Les `User.id` des ADMIN/BIGBOSS, derrière un cache mémoire à TTL.
   *
   * La requête est bornée par le nombre d'administrateurs — jamais par la
   * population connectée de la passerelle, la contrainte de coût que ce chemin
   * porte depuis qu'il a cessé d'énumérer `connectedUsers`. Le cache évite de
   * la rejouer à chaque connexion et déconnexion ; sa TTL est celle de
   * l'instantané de présence, pour la même raison : le retard maximal d'une
   * promotion de rôle sur ce canal est de 60 s, et la porte REST
   * (`PresenceVisibilityService`) n'a, elle, aucun retard.
   *
   * Une room `user:<id>` sans socket vivant ne coûte rien à `.to()` : un
   * administrateur déconnecté n'est pas un destinataire à filtrer.
   */
  private async _globalAdminUserIds(): Promise<string[]> {
    const cached = this.globalAdminIdsCache;
    if (cached && Date.now() - cached.cachedAt < this.GLOBAL_ADMIN_IDS_CACHE_TTL_MS) {
      return cached.ids;
    }
    const rows = await this.prisma.user.findMany({
      where: { role: { in: PRESENCE_PRIVILEGED_ROLES } },
      select: { id: true },
    });
    const ids = rows.map(row => row.id);
    this.globalAdminIdsCache = { ids, cachedAt: Date.now() };
    return ids;
  }

  /**
   * Diffuse une transition de présence (connexion / déconnexion) aux personnes
   * AUTORISÉES à la connaître.
   *
   * Directive produit (2026-08-25), gravée dans
   * `packages/shared/utils/presence-visibility.ts` : « Lorsqu'on n'est pas ami
   * (aucune connexion) : je veux supprimer ma présence en ligne […] et personne
   * ne doit savoir ma dernière connexion sur l'application si on n'est pas ami.
   * Les utilisateurs avec le rôle ADMIN et supérieur peuvent constamment avoir
   * l'état de présence. »
   *
   * L'audience est donc faite de RELATIONS, et d'elles seules :
   *
   *  - **inscrit** — les rooms personnelles (`ROOMS.user`) de ses AMIS acceptés,
   *    des ADMIN/BIGBOSS, et la sienne (ses autres appareils). **Aucune room de
   *    conversation.** Partager un fil n'est pas une relation : c'était pourtant
   *    l'adresse qui, jusqu'à ce lot, livrait chaque transition à tout
   *    co-participant inconnu — la fuite exacte que la directive nomme.
   *  - **invité de lien (anonyme)** — il n'a pas de compte, donc pas d'ami :
   *    ADMIN/BIGBOSS seulement. Son nom d'affichage ne part plus dans le fil.
   *
   * Deux charges au plus, jamais une seule aplatie : `showOnlineStatus = false`
   * doit taire la présence pour les AMIS sans la taire pour les administrateurs
   * ni pour les autres appareils du sujet, que la loi partagée met en FULL. Le
   * `return` précoce sur cette préférence coupait les trois d'un coup. La
   * décision « quelle charge pour quel sous-ensemble » vit dans
   * `presenceStatusEmissions` (`./presence-audience`), pure et testée à part —
   * `lastActiveAt` y tombe avec `showLastSeen` pour les amis seulement, car il
   * voyage À CÔTÉ d'`isOnline` et un gate posé sur le seul drapeau le
   * laisserait partir.
   *
   * Un sujet DÉSACTIVÉ n'émet AUCUNE charge — pas même la privilégiée. La loi
   * partagée (`resolvePresenceVisibility`) tranche `targetIsDeactivated` AVANT
   * le privilège, et `resolveForTargets` l'applique déjà à l'instantané comme à
   * la porte REST ; ce canal la rejoint (revue F6, 2026-08-26). Le point
   * compte parce que la désactivation (`user-management.service.updateStatus`)
   * pose `deactivatedAt` SANS révoquer les sockets : un compte désactivé encore
   * connecté continuait d'annoncer chacune de ses transitions à son éventail.
   * `Participant` n'a pas de `deactivatedAt` — l'invité de lien n'est pas
   * concerné.
   *
   * Le blocage bidirectionnel reste appliqué à TOUTES les charges, y compris
   * celle des administrateurs : `.except(socketIds)` — un socket.id est aussi
   * une room Socket.IO. C'est un cran plus strict que
   * `PresenceVisibilityService.resolveForTargets`, qui rend FULL à un admin
   * bloqué ; sur un canal de DIFFUSION, la décision de l'utilisateur de couper
   * le lien l'emporte, et c'est le comportement qui existait déjà ici.
   *
   * Coût par transition, la contrainte de ce chemin : une lecture de
   * préférences (cachée), une lecture d'utilisateur, UNE requête `FriendRequest`
   * bornée par le nombre d'amis, la liste d'administrateurs (cachée 60 s) et la
   * relation de blocage (bornée par elle-même). Rien n'y est dimensionné par la
   * population connectée. Les deux requêtes `participant` qu'exigeait
   * l'adressage par conversation ont disparu avec lui.
   */
  private async _broadcastUserStatus(userId: string, isOnline: boolean, isAnonymous: boolean): Promise<void> {
    try {
      const adminIds = await this._globalAdminUserIds();

      if (isAnonymous) {
        // Aucun ami possible, donc aucune audience hors administrateurs : sans
        // eux, la lecture du participant elle-même n'a plus de destinataire.
        if (adminIds.length === 0) return;

        // userId is participantId for anonymous
        const participant = await this.prisma.participant.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            nickname: true,
            lastActiveAt: true
          }
        });
        if (!participant) return;

        // Les préférences ne sont pas lues : le seul sous-ensemble servi est
        // celui que la loi partagée met en FULL, où elles ne s'appliquent pas.
        for (const emission of presenceStatusEmissions({
          subjectId: participant.id,
          isAnonymous: true,
          friendIds: [],
          adminIds,
          lastActiveAt: participant.lastActiveAt,
          showOnlineStatus: true,
          showLastSeen: true,
        })) {
          this.io.to(emission.rooms).emit(SERVER_EVENTS.USER_STATUS, {
            userId: participant.id,
            username: participant.nickname || participant.displayName,
            isOnline,
            lastActiveAt: emission.lastActiveAt
          });
        }
        return;
      }

      // PRIVACY: les préférences gouvernent le sous-ensemble AMIS, pas la
      // totalité de l'éventail — d'où l'absence de `return` précoce ici.
      const privacyPrefs = await this.privacyPreferencesService.getPreferences(userId, false);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          lastActiveAt: true,
          deactivatedAt: true
        }
      });
      if (!user) return;
      // Un compte DÉSACTIVÉ n'a de présence pour personne : la loi partagée
      // rend HIDDEN sur `targetIsDeactivated` AVANT le privilège, donc ni les
      // amis, ni les ADMIN, ni ses autres appareils ne reçoivent la transition.
      if (user.deactivatedAt) return;

      // La requête d'amitiés n'est même pas lancée quand elle ne peut servir
      // personne : `showOnlineStatus = false` retire tout le sous-ensemble AMIS.
      const friendIds = privacyPrefs.showOnlineStatus
        ? [...await this.presenceVisibilityService.acceptedFriendIds(user.id)]
        : [];

      const emissions = presenceStatusEmissions({
        subjectId: user.id,
        isAnonymous: false,
        friendIds,
        adminIds,
        lastActiveAt: user.lastActiveAt,
        showOnlineStatus: privacyPrefs.showOnlineStatus,
        showLastSeen: privacyPrefs.showLastSeen,
      });
      if (emissions.length === 0) return;

      const displayName = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username;

      // PRIVACY: exclure les sockets des viewers en relation de blocage
      // bidirectionnel avec ce user. Un socket.id est aussi une room Socket.IO
      // (auto-join), donc .except(socketId) l'exclut du broadcast même s'il est
      // par ailleurs membre de `rooms`.
      //
      // La relation de blocage est résolue SANS liste de candidats. La version
      // d'avant passait `connectedUsers.keys()` — toute la population connectée
      // de la gateway — en candidats, si bien qu'une seule transition de
      // présence portait un `$in` dimensionné par le serveur entier.
      //
      // Le résultat est le MÊME : un id en relation de blocage qui n'a aucun
      // socket vivant n'apporte rien à `.except()`. `userSockets` est vidé à la
      // déconnexion (`AuthHandler.handleDisconnection`), donc l'intersection se
      // fait ici, en mémoire, au lieu d'en base.
      const blockedUserIds = await getBlockRelatedUserIds(this.prisma, user.id);
      const blockedSocketIds = [...blockedUserIds].flatMap(
        id => [...(this.userSockets.get(id) ?? [])],
      );

      for (const emission of emissions) {
        const emitter = blockedSocketIds.length > 0
          ? this.io.to(emission.rooms).except(blockedSocketIds)
          : this.io.to(emission.rooms);
        emitter.emit(SERVER_EVENTS.USER_STATUS, {
          userId: user.id,
          username: displayName,
          isOnline,
          lastActiveAt: emission.lastActiveAt
        });
      }
    } catch (error) {
      logger.error('❌ [STATUS] Erreur lors du broadcast du statut', error);
    }
  }


  /**
   * PHASE 3.1: Broadcast d'un nouveau message via MessagingService
   * Remplace l'ancienne logique de broadcast dans _handleNewMessage
   * Utilise le comportement simple et fiable de l'ancienne méthode
   * 
   * OPTIMISATION: Le calcul des stats est fait de manière asynchrone (non-bloquant)
   */
  private async _broadcastNewMessage(message: Message, conversationId: string, senderSocket?: Socket): Promise<void> {
    try {
      const normalizedId = await this.normalizeConversationId(conversationId);

      // Translation transform is synchronous (field reshape from MongoDB JSON object
      // to array). Call directly — no DB query, no await needed.
      let messageTranslations: any[] = [];
      if (message.id) {
        try {
          messageTranslations = transformTranslationsToArray(
            message.id,
            message.translations as unknown as Record<string, import('../utils/translation-transformer').MessageTranslationJSON>
          );
        } catch (error) {
          logger.warn(`Translation transform failed for message ${message.id}`, { error });
        }
      }

      // Fire stats update as true fire-and-forget — it is a non-critical DB side-effect
      // (cache warm-up for `conversation:stats`). Previously awaited via Promise.allSettled,
      // which blocked the broadcast by the full duration of the MongoDB write (~10–50ms).
      conversationStatsService.updateOnNewMessage(
        this.prisma,
        conversationId,
        message.originalLanguage || 'fr',
        () => this.getConnectedUsers()
      ).catch(error => {
        logger.warn(`⚠️ [PERF] Erreur calcul stats (non-bloquant): ${error}`);
      });

      // Construire le payload de message pour broadcast - compatible avec les types existants
      // CORRECTION CRITIQUE: Utiliser l'ObjectId normalisé pour cohérence client-serveur
      const senderParticipant = message.sender;
      // CORRECTION senderId: message.senderId = participant ID, mais les clients comparent
      // senderId avec leur userId. On expose sender.userId (= User.id) en priorité.
      const resolvedSenderId = senderParticipant?.userId || senderParticipant?.user?.id || message.senderId || undefined;
      // Charge utile `message:new` : les champs DÉRIVÉS DE LA LIGNE MESSAGE
      // viennent de `buildMessageNewPayload`, la source unique partagée avec le
      // transport socket (`MessageHandler._buildMessagePayload`). Ce chemin-ci
      // en portait une copie manuscrite qui avait perdu quatre familles de
      // champs — l'enveloppe E2EE, le plafond de vue-unique, la provenance d'un
      // transfert et la réponse à un post — soit exactement celles des messages
      // qu'il est SEUL à porter côté iOS (`socketFirstEligible` envoie par REST
      // toute pièce jointe, tout DM chiffré, toute vue-unique, tout éphémère,
      // tout message à effets). Cf. l'en-tête de `messageNewPayload.ts`.
      //
      // `originalContent` et `metadata` restent propres à ce transport :
      //   - `originalContent` n'est PAS une colonne — il duplique `content` sur
      //     le fil, et le web le lit en second (`content || originalContent`).
      //     L'ajouter au chemin socket doublerait le poids texte du chemin le
      //     plus chaud du service pour un alias hérité ; le retirer d'ici est un
      //     RETRAIT, qui demande d'abord de relever ses consommateurs web.
      //   - `metadata` est l'enveloppe brute d'où le chemin socket HISSE ce dont
      //     les clients ont besoin (`location`, `trackingLinks`, `postReplyTo`).
      //     iOS y lit encore `callSummary` et `joinNotice`, deux familles de
      //     messages système que seul ce transport-ci produit.
      const messagePayload = {
        ...buildMessageNewPayload(message, {
          conversationId: normalizedId,
          translations: messageTranslations,
          // Le `select` du chemin REST livre déjà les pièces jointes à la forme
          // rendue ; le chemin socket, lui, les normalise (cf. la note jumelle).
          attachments: message.attachments ?? [],
          // DUPLICATION ASSUMÉE avec MessageHandler._buildMessagePayload : ce
          // bloc RECONSTRUIT et APLATIT le sender (username/firstName/lastName
          // remontés depuis `sender.user`), alors que le chemin socket fait un
          // passthrough BRUT. Les deux formes de fil sont DÉLIBÉRÉMENT
          // différentes — les fusionner changerait la forme consommée par un
          // client sans certitude sur lequel des deux en dépend.
          replyTo: message.replyTo ? hoistLocationOnto({
            id: message.replyTo.id,
            conversationId: normalizedId,
            senderId: message.replyTo.senderId || undefined,
            content: message.replyTo.content,
            originalLanguage: message.replyTo.originalLanguage || 'fr',
            messageType: (message.replyTo.messageType || 'text') as MessageType,
            createdAt: message.replyTo.createdAt || new Date(),
            metadata: (message.replyTo as unknown as { metadata?: unknown }).metadata,
            sender: message.replyTo.sender ? {
              id: message.replyTo.sender.id,
              displayName: message.replyTo.sender.nickname || message.replyTo.sender.displayName,
              avatar: message.replyTo.sender.avatar,
              type: message.replyTo.sender.type,
              userId: message.replyTo.sender.userId,
              username: message.replyTo.sender.user?.username,
              firstName: message.replyTo.sender.user?.firstName || '',
              lastName: message.replyTo.sender.user?.lastName || '',
            } : undefined
          } as unknown as Record<string, unknown>) : undefined,
        }),
        originalContent: (message as unknown as Record<string, unknown>)['originalContent'] as string | undefined || message.content,
        metadata: message.metadata || undefined,
      };

      // Lieu partagé : hisser `metadata.location` en top-level `location`.
      // Ce broadcast sert AUSSI le chemin REST (POST /conversations/:id/messages
      // → MeeshySocketIOManager.broadcastMessage) et les messages d'agent — un
      // hoist manquant ICI laisserait la position invisible en temps réel pour
      // tout message envoyé via REST, alors même que `messagePayload.metadata`
      // porte déjà le bloc brut. Miroir de MessageHandler.broadcastNewMessage
      // (chemin socket `message:send`).
      const place = sharedPlaceFromMetadata(message.metadata);
      if (place) {
        (messagePayload as Record<string, unknown>).location = place;
      }

      if (message.attachments && message.attachments.length > 0) {
        const first = message.attachments[0] as unknown as Record<string, unknown>;
        const firstMeta = typeof first['metadata'] === 'object' && first['metadata'] ? first['metadata'] as Record<string, unknown> : null;
        logger.debug(`message:new broadcast messageId=${message.id} attachments=${message.attachments.length}`);
      }

      // COMPORTEMENT SIMPLE ET FIABLE DE L'ANCIENNE MÉTHODE
      const room = ROOMS.conversation(normalizedId);

      // Phase 4 §6.2 — split en DEUX payloads, à l'identique du chemin socket
      // (`MessageHandler.broadcastNewMessage`) et des deux routes de lien :
      //
      //   - `senderPayload` (rooms personnelles de l'expéditeur, tous appareils)
      //     GARDE `clientMessageId`, seul moyen pour une ligne optimiste d'être
      //     promue à `.sent` par le fil temps réel.
      //   - `broadcastPayload` (tous les autres) le RETIRE : un pair n'a pas à
      //     apprendre l'espace d'ids optimistes de l'expéditeur.
      //
      // Ce chemin est celui de TOUT envoi REST — donc, côté iOS, de tout envoi
      // non éligible au socket-first : pièce jointe, DM chiffré, vue-unique,
      // éphémère, message à effets (`socketFirstEligible`, ConversationViewModel).
      // Il n'avait ni l'une ni l'autre moitié du contrat : le cid n'était pas
      // dans le payload du tout. La réponse HTTP restait alors la SEULE voie de
      // promotion — et quand elle se perd (app mise en fond, réseau coupé,
      // crash), le renvoi de l'outbox porte le même `clientMessageId`, la route
      // le déduplique et NE REBROADCASTE PAS (garde `!isDuplicate`,
      // routes/conversations/messages.ts). La bulle restait donc bloquée en
      // `.sending` alors que le message était bel et bien stocké et distribué.
      // Pas de cast en `Record<string, unknown>` : `stripClientMessageId` est
      // générique et préservant (cycle 7), donc les deux payloads gardent le
      // type du littéral et l'emit typé `message:new` reste vérifié.
      const senderPayload = messagePayload;
      const broadcastPayload = stripClientMessageId(messagePayload);
      // `Participant.userId` — null pour un invité de lien partagé, qui n'a
      // aucune `ROOMS.user(User.id)` à adresser (son unique room personnelle est
      // nommée d'après son `Participant.id`, et elle est dans la conversation).
      const senderUserId = senderParticipant?.userId ?? null;

      // 1. Broadcast vers tous les clients de la conversation.
      //
      // Bandwidth sprint Phase B1 — per-language filtered broadcast.
      // Groups room sockets by preferred language (zero DB query, from connectedUsers map)
      // and sends a trimmed payload once per distinct language. Original content preserved.
      // Opt-in (OFF by default): enable explicitly with SOCKET_LANG_FILTER=true once
      // validated in staging (measured savings + multi-device + Prisme fallback check).
      const langFilterOn = process.env.SOCKET_LANG_FILTER === 'true';

      if (senderUserId) {
        if (langFilterOn) {
          this._emitMessageNewByLanguage(room, broadcastPayload, { excludeUserId: senderUserId });
        } else {
          this.io
            .to(room)
            .except(ROOMS.user(senderUserId))
            .emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
        }
        this.io.to(ROOMS.user(senderUserId)).emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      } else if (langFilterOn) {
        this._emitMessageNewByLanguage(room, broadcastPayload);
      } else {
        this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, broadcastPayload);
      }

      // 2. S'assurer que l'auteur reçoit aussi (au cas où il ne serait pas dans la room encore).
      // Il reçoit le payload cid-aware : c'est SON socket, et c'est lui qui doit
      // pouvoir réconcilier. Aucun appelant de production ne passe `senderSocket`
      // aujourd'hui (les deux sites, `broadcastMessage` et le retour ZMQ, l'omettent) —
      // la branche reste pour les appelants de test et une éventuelle réutilisation.
      if (senderSocket) {
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
      }

      // 2b. Emit mention:created to each mentioned user's personal room.
      // validatedMentions is persisted as String[] of usernames (schema.prisma), NOT objects —
      // resolve them to User.ids before emitting. The self-mention guard compares against
      // resolvedSenderId (the sender's User.id); message.senderId is a Participant.id and would
      // never match a resolved User.id. Resolution is wrapped so a lookup failure never blocks
      // the message broadcast (parity with MessageHandler._resolveMentionUserIds on the socket path).
      const mentionUsernames = (message.validatedMentions ?? []) as unknown as string[];
      if (mentionUsernames.length > 0) {
        try {
          const mentionedUserIds = await resolveUsernamesToIds(this.prisma, mentionUsernames);
          for (const targetUserId of mentionedUserIds) {
            if (targetUserId && targetUserId !== resolvedSenderId) {
              this.io.to(ROOMS.user(targetUserId)).emit(SERVER_EVENTS.MENTION_CREATED, {
                messageId: message.id,
                conversationId: normalizedId,
                senderId: resolvedSenderId,
                mentionedUserId: targetUserId,
                content: message.content,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          logger.warn(`⚠️ [MENTION] Failed to resolve mention usernames for broadcast (mentions skipped): ${error}`);
        }
      }

      const roomClients = this.io.sockets.adapter.rooms.get(room);

      // 3. Synchronisation temps réel de la liste des conversations. Deux signaux
      //    par destinataire, partageant une SEULE requête participants :
      //    - CONVERSATION_UPDATED (bump lastMessageAt) → liste se re-trie et les
      //      conversations toutes neuves apparaissent même quand MESSAGE_NEW
      //      n'atteint aucun socket hors de ROOMS.conversation(id). Émis à TOUS
      //      les participants (expéditeur inclus — sa propre liste remonte aussi).
      //    - CONVERSATION_UNREAD_UPDATED (badge) → destinataires uniquement
      //      (l'expéditeur n'a pas de non-lu sur son propre message).
      //    Parité avec MessageHandler.broadcastNewMessage (chemin socket).
      try {
        const senderId = message.senderId;
        if (senderId) {
          // Une seule requête : superset (id + userId + joinedAt) pour les deux signaux
          //
          // Dans son PROPRE `try`, et rendue `undefined` — jamais `[]` — quand
          // elle tombe. Les deux formes se lisent pareil au site d'appel et ne
          // disent pas la même chose : `[]` affirme « la conversation n'a aucun
          // participant », `undefined` avoue « je ne sais pas ». La file hors
          // ligne ci-dessous traite les deux différemment, et c'est la seule des
          // trois consommatrices dont l'abandon soit DESTRUCTIF (cf. son bloc).
          let allParticipants: Array<PreviewPrismParticipant & { joinedAt: Date }> | undefined;
          try {
            allParticipants = await this.prisma.participant.findMany({
              where: {
                conversationId: normalizedId,
                isActive: true
              },
              // `user` (préférences de langue) : le Prisme de la ligne de liste,
              // résolu par destinataire ci-dessous. `joinedAt` reste requis par
              // `emitUnreadCountsToRecipients`, qui partage cette requête.
              select: { ...PREVIEW_PRISM_PARTICIPANT_SELECT, joinedAt: true }
            });
          } catch (err) {
            logger.warn('participant fetch failed — la file hors ligne fera sa propre requête', { error: err });
          }

          // File hors ligne — la TROISIÈME porte de sortie de ce message, et la
          // seule DURABLE. `message:new` ci-dessus ne sert que les sockets du
          // salon ; un destinataire déconnecté n'apprend jamais l'existence de
          // ce message autrement que par le rejeu de `_drainPendingMessages`.
          //
          // Elle passe AVANT les deux signaux cosmétiques qui suivent, et c'est
          // tout l'objet de sa place : elle en était l'AVAL, dans le même `try`,
          // sous un `catch` qui journalise « non-bloquant ». Un `emit` qui lève
          // (adaptateur ou encodeur en défaut) annulait alors le rejeu pour TOUS
          // les absents, en annonçant une perte cosmétique. Même règle qu'à
          // l'instantané de reconnexion, où le drain est placé HORS du `try`
          // pour qu'un accroc Mongo cosmétique n'échoue jamais le rejeu.
          //
          // `participants` reçoit `undefined` quand le superset est tombé :
          // l'unité partagée refait alors SA requête, qui ne demande que
          // `{id, userId}`. Lui passer `[]` la ferait enfiler pour personne —
          // perdre le message parce qu'une préférence de langue est illisible.
          //
          // Délègue à l'unité partagée (comme les trois autres transports) : la
          // copie inline qui vivait ici était le dernier appelant direct de
          // `deliveryQueue.enqueue` du dépôt, et son `payload as Record<string,
          // unknown>` le dernier endroit où une charge pouvait être ENFILÉE sous
          // une forme que le fil ne diffuse pas.
          await this._enqueueForOfflineParticipants({
            conversationId: normalizedId,
            // Les DEUX identités, comme le chemin WS : `message.senderId` porte
            // un `Participant.id` ici, un `User.id` ailleurs, et les deux
            // espaces d'ids ne se croisent jamais.
            actorParticipantId: senderId,
            actorUserId: senderId,
            eventType: 'new',
            messageId: message.id,
            // Le corps DESTINATAIRE (cid-strippé), identique à l'émission live :
            // un rejeu portant le `clientMessageId` de l'auteur ferait fuiter son
            // espace d'ids optimistes dans celui d'un autre utilisateur.
            payload: broadcastPayload,
            participants: allParticipants,
          });

          if (allParticipants) {
            // CONVERSATION_UPDATED → room user de CHAQUE participant (re-tri liste).
            // `updatedBy` est requis par ConversationUpdatedEventData (this.io est typé,
            // contrairement à MessageHandler) : c'est l'auteur du message qui déclenche
            // le bump (resolvedSenderId = User.id du sender, fallback participant id).
            const updatePayload = {
              conversationId: normalizedId,
              updatedBy: { id: resolvedSenderId ?? message.senderId ?? '' },
              // Chaîne ISO — voir `toIsoOrNull`. `|| new Date()` conservé : ce
              // chemin sert aussi des messages fabriqués (agent, traducteur) dont
              // le `createdAt` peut manquer, et la ligne de liste a besoin d'un
              // rang pour se trier.
              lastMessageAt: toIsoOrNull(message.createdAt || new Date()),
              lastMessageId: message.id,
              // `lastMessagePreview` sort de `resolveLastMessagePreviewPrism`
              // avec le reste de la paire, sous le même plafond qu'elle.
              // Un message position-seule a un `content` vide, donc un aperçu
              // vide : `location` est alors la SEULE chose dont la ligne de liste
              // dispose pour composer son libellé. Hissée ici comme les deux
              // autres émetteurs de ce payload le font déjà (`MessageHandler.ts`,
              // `emitConversationPreviewUpdate.ts`) — sans elle, ce chemin-ci
              // (REST/ZMQ, celui par lequel passe justement l'envoi d'un lieu)
              // laissait la ligne littéralement blanche.
              //
              // Clé ABSENTE quand le message n'a pas de position, jamais présente
              // à `null` : les clients écrivent `location` AVEC l'identité du
              // message, donc une clé nulle sur le chemin le plus fréquenté du
              // service effacerait une épingle correcte à chaque message texte.
              ...((): Record<string, unknown> => {
                const place = sharedPlaceFromMetadata((message as { metadata?: unknown }).metadata);
                return place ? { location: place } : {};
              })(),
              senderId: message.senderId,
              updatedAt: new Date().toISOString()
            };
            // `userId ?? id` (participantUserRoomTargets) : parité avec le chemin
            // socket de MessageHandler. Un participant sans compte a une room
            // personnelle nommée d'après son `Participant.id` — la sauter privait un
            // invité de lien partagé de tout re-tri de sa liste de conversations.
            //
            // Le Prisme est résolu PAR destinataire, depuis le MÊME `message` qui
            // alimente `message:new` ci-dessus : les deux événements portent donc
            // toujours la même carte, et le `conversation:updated` jumeau ne peut pas
            // arriver derrière pour effacer ce que `message:new` vient d'installer.
            for (const { room, participant } of participantUserRoomTargets(allParticipants)) {
              this.io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
                ...updatePayload,
                ...resolveLastMessagePreviewPrism(participant, message)
              });
            }

            // Badge non-lu → destinataires uniquement (exclure l'expéditeur in-process).
            // Délégué à l'unité partagée par les trois transports d'envoi : la copie
            // inline qui vivait ici n'excluait l'expéditeur que par `Participant.id`,
            // correct sur CE chemin mais faux pour tout appelant portant un `User.id`.
            // La liste déjà chargée lui est passée — pas de seconde requête.
            await emitUnreadCountsToRecipients({
              io: this.io,
              prisma: this.prisma,
              readStatusService: this.readStatusService,
              bridgeService: this.bridgeService,
              conversationId: normalizedId,
              senderId,
              participants: allParticipants,
              onError: (error) => logger.warn('unread count update failed', { error }),
            });
          }
        }
      } catch (syncError) {
        logger.warn('⚠️ [CONV_SYNC] Erreur sync liste conversations (non-bloquant):', syncError);
      }

      // Auto-mark delivered for online-but-away recipients on the REST/ZMQ broadcast
      // path too — parity with the WS `message:send` path (which does this via
      // MessageHandler.broadcastNewMessage → autoDeliverToOnlineRecipients). Without
      // this, a message sent through the REST route (POST /conversations/:id/messages →
      // broadcastMessage) never upgrades the sender's checkmark from "sent" to
      // "delivered" for a recipient who is connected but viewing another conversation,
      // because `message:new` only reaches sockets already in `conversation:<id>`.
      // Delegates to the single shared implementation on the message handler (same
      // io / connectedUsers / read-status + privacy services), so both transports
      // produce identical receipt behavior. Fire-and-forget, like the WS path.
      this.messageHandler.autoDeliverToOnlineRecipients(message, normalizedId).catch((err) => {
        logger.warn('auto-deliver (REST/ZMQ broadcast) background failure', { error: err });
      });

      // Envoyer les notifications de message pour les utilisateurs non connectés à la conversation
      if (message.senderId) {
        // Note: Les notifications sont gérées directement dans routes/notifications.ts
      }
      
    } catch (error) {
      logger.error('[PHASE 3.1] Erreur broadcast message', error);
    }
  }

  /**
   * B3 (5.3) — appelée par `PATCH /users/profile` quand un user change de langue,
   * pour que `SOCKET_LANG_FILTER` filtre sur la nouvelle langue sans reconnexion.
   * No-op si le user n'est pas connecté.
   */
  public refreshUserResolvedLanguages(
    userId: string,
    prefs: {
      systemLanguage?: string | null;
      regionalLanguage?: string | null;
      customDestinationLanguage?: string | null;
      deviceLocale?: string | null;
    }
  ): void {
    applyResolvedLanguagesRefresh(this.connectedUsers, userId, prefs);
  }

  /**
   * Public wrapper: invalide l'identité de frappe mise en cache d'un user
   * (`username` / `displayName`) après un changement de profil pertinent, afin
   * que l'indicateur « en train d'écrire » affiche le nouveau nom immédiatement
   * au lieu d'attendre l'expiration du TTL du cache d'identité du StatusHandler.
   *
   * Sans cet appel, un utilisateur qui renomme son displayName (ou change de
   * username) puis se remet à taper apparaîtrait sous son ANCIEN nom à ses
   * pairs pendant toute la fenêtre TTL — alors que sa vue de profil, elle, est
   * déjà mise à jour en temps réel via `emitUserUpdated`. Miroir de la même
   * invalidation faite au `disconnect` et jumeau REST de
   * `refreshUserResolvedLanguages` ci-dessus. Best-effort.
   */
  public refreshUserTypingIdentity(userId: string): void {
    this.statusHandler.invalidateIdentityCache(userId);
  }

  /**
   * Public wrapper pour broadcaster un nouveau message depuis une route REST.
   * Permet aux routes HTTP de déclencher le broadcast socket sans accéder aux méthodes privées.
   */
  public async broadcastMessage(message: Message, conversationId: string): Promise<void> {
    const messageWithTimestamp = {
      ...message,
      timestamp: message.createdAt || (message as unknown as { timestamp?: Date })['timestamp'] || new Date()
    };
    await this._broadcastNewMessage(messageWithTimestamp as Message, conversationId);
  }

  /**
   * Server-authored in-place edition of a SYSTEM message — the live call
   * message ("Appel … en cours") becoming its terminal summary. Emits
   * `message:edited` to the conversation room with the FULL payload.
   * Invariants relied upon by clients:
   *   - `metadata` is ALWAYS present (the web cache merge `{...m, ...msg}`
   *     only replaces metadata when the key exists in the payload);
   *   - `editedAt = updatedAt` (never null — clients use it as the
   *     stale-edit ordering guard);
   *   - `isEdited` is NOT forced true: a state transition is not a user edit.
   * Also fans the conversation-list preview to `user:<id>` rooms (NO unread
   * bump — that was already paid when the live message was posted) and
   * enqueues the edition for offline participants, so a callee offline for
   * the whole call still receives the "Appel manqué" terminal state at
   * reconnect. Best-effort: never throws.
   */
  public async broadcastMessageEdited(message: Message, conversationId: string): Promise<void> {
    try {
      const normalizedId = await this.normalizeConversationId(conversationId);

      let messageTranslations: unknown[] = [];
      if (message.id) {
        try {
          messageTranslations = transformTranslationsToArray(
            message.id,
            message.translations as unknown as Record<string, import('../utils/translation-transformer').MessageTranslationJSON>
          );
        } catch (error) {
          logger.warn(`Translation transform failed for edited message ${message.id}`, { error });
        }
      }

      const senderParticipant = message.sender;
      const resolvedSenderId = resolveWireSenderId(message);
      const updatedAt = message.updatedAt || new Date();
      // Le NOYAU du contrat vient de `buildMessageEditedCore`, source unique
      // partagée avec le transport socket (`MessageHandler.handleMessageEdit`),
      // qui en omettait trois champs requis — cf.
      // `socketio/messageEditedPayload.ts`. Ce producteur-ci les servait déjà
      // tous : le passage à l'unité ne change RIEN de ce qu'il émet, il
      // supprime la possibilité qu'un quatrième transport diverge.
      const editedPayload = {
        ...buildMessageEditedCore(message, {
          conversationId: normalizedId,
          content: message.content,
          isEdited: Boolean(message.isEdited),
          editedAt: updatedAt,
        }),
        messageSource: message.messageSource || undefined,
        metadata: message.metadata ?? {},
        translations: messageTranslations,
        sender: senderParticipant ? {
          id: senderParticipant.id,
          displayName: senderParticipant.nickname || senderParticipant.displayName,
          avatar: senderParticipant.avatar || senderParticipant.user?.avatar,
          type: senderParticipant.type,
          userId: senderParticipant.userId,
          username: senderParticipant.user?.username,
          firstName: senderParticipant.user?.firstName || '',
          lastName: senderParticipant.user?.lastName || '',
        } : undefined,
        attachments: message.attachments ?? [],
      };

      this.io.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.MESSAGE_EDITED, editedPayload);

      await emitConversationPreviewUpdate(
        this.prisma, this.io, normalizedId, resolvedSenderId ?? '',
        (err) => logger.warn('conversation preview fanout (call edit) failed', { error: err })
      );

      await this.enqueueOfflineMessageMutation({
        conversationId: normalizedId,
        actorUserId: null,
        eventType: 'edited',
        messageId: message.id,
        payload: editedPayload,
      });
    } catch (error) {
      logger.error('broadcast message:edited (call) failed', error);
    }
  }


  // Méthodes publiques pour les statistiques et la gestion
  getStats() {
    return {
      ...this.stats,
      connected_users: this.connectedUsers.size,
      translation_service_stats: this.translationService.getStats()
    };
  }

  /**
   * Vérifie si un utilisateur est connecté
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }


  /**
   * Vérifie si un utilisateur est dans une salle de conversation.
   *
   * Multi-device : un utilisateur peut avoir plusieurs sockets (téléphone + web).
   * On considère qu'il est dans la salle si N'IMPORTE LAQUELLE de ses sessions
   * y est — `connectedUsers[...].socketId` ne pointe que sur la dernière session
   * promue et donnerait un faux négatif quand la conversation est ouverte sur un
   * autre appareil (ex. suppression de push mal déclenchée). `userSockets` est la
   * source de vérité multi-device.
   */
  isUserInConversationRoom(userId: string, conversationId: string): boolean {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return false;
    const room = `conversation:${conversationId}`;
    for (const socketId of socketIds) {
      if (this.io.sockets.sockets.get(socketId)?.rooms.has(room)) {
        return true;
      }
    }
    return false;
  }


  /**
   * Déconnecte un utilisateur spécifique.
   *
   * Multi-device : ferme TOUTES les sessions de l'utilisateur (téléphone + web).
   * L'ancienne implémentation ne fermait que `connectedUsers[...].socketId` (la
   * dernière session promue) ; la déconnexion de ce socket promouvait alors une
   * autre session dans `connectedUsers`, laissant l'utilisateur en ligne — un
   * force-logout / bannissement était contournable pour toute session multiple.
   * On itère sur un snapshot car `disconnect(true)` déclenche `handleDisconnection`
   * qui mute `userSockets` pendant l'itération.
   */
  disconnectUser(userId: string): boolean {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return false;
    let disconnected = false;
    for (const socketId of [...socketIds]) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
        disconnected = true;
      }
    }
    return disconnected;
  }

  /**
   * Envoie une notification à un utilisateur spécifique.
   *
   * Multi-device : émet sur TOUTES les sessions de l'utilisateur. L'ancienne
   * implémentation n'émettait que sur `connectedUsers[...].socketId`, perdant
   * silencieusement l'événement sur les autres appareils. Retourne `true` dès
   * qu'au moins un socket a reçu l'événement.
   */
  sendToUser<K extends keyof ServerToClientEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ): boolean {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return false;
    let sent = false;
    for (const socketId of socketIds) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, ...args);
        sent = true;
      }
    }
    return sent;
  }

  /**
   * Broadcast un message à tous les utilisateurs connectés
   */
  broadcast<K extends keyof ServerToClientEvents>(
    event: K, 
    ...args: Parameters<ServerToClientEvents[K]>
  ): void {
    this.io.emit(event, ...args);
  }

  /**
   * Obtient la liste des utilisateurs connectés
   */
  getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  /**
   * Joins all active sockets of a user to a conversation room.
   * Called when a user is added to a conversation while already connected
   * (e.g. group invite mid-session) so they immediately receive message:new
   * events without requiring a reconnect.
   */
  async joinUserToConversationRoom(userId: string, conversationId: string): Promise<void> {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return;
    const room = ROOMS.conversation(conversationId);
    await Promise.all(
      Array.from(socketIds).map(async (socketId) => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) return;
        await socket.join(room);
      })
    );
  }



  async healthCheck(): Promise<boolean> {
    try {
      const translationHealth = await this.translationService.healthCheck();
      return translationHealth;
    } catch (error) {
      logger.error(`❌ Health check échoué: ${error}`);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      // ✅ FIX BUG #3: Ticker supprimé, plus besoin de le nettoyer
      // Le système n'utilise plus de polling périodique

      await this.agentAdminRelay?.stop();
      await this.translationService.close();
      // Les minuteries d'expiration des partages de position sont les seules
      // que ce manager possède encore ; non désarmées, elles retiendraient la
      // boucle d'événements jusqu'à 8 heures après l'arrêt.
      this.locationHandler.dispose();
      this.io.close();
    } catch (error) {
      logger.error(`❌ Erreur fermeture MeeshySocketIOManager: ${error}`);
    }
  }

  // --------------------------------------------------------------------------
  // AGENT INTEGRATION
  // --------------------------------------------------------------------------

  setAgentClient(client: ZmqAgentClient): void {
    this.agentClient = client;
    logger.info('[Agent] ZmqAgentClient wired to SocketIOManager');
  }

  async handleAgentResponse(response: {
    type: 'agent:response';
    conversationId: string;
    asUserId: string;
    content: string;
    originalLanguage: string;
    replyToId?: string;
    mentionedUsernames?: string[];
    messageSource: 'agent';
    metadata: { agentType: 'impersonator' | 'animator' | 'orchestrator'; roleConfidence: number; archetypeId?: string };
  }): Promise<void> {
    try {
      // Resolve mentionedUsernames to mentionedUserIds for the full mention pipeline
      let mentionedUserIds: string[] | undefined;
      if (response.mentionedUsernames && response.mentionedUsernames.length > 0) {
        const ids = await resolveUsernamesToIds(this.prisma, response.mentionedUsernames);
        if (ids.length > 0) {
          mentionedUserIds = ids;
        }
      } else if (response.content?.includes('@')) {
        // Résolution @DisplayName depuis les participants de la conversation
        const participants = await this.getConversationParticipantsForMention(response.conversationId);
        if (participants.length > 0) {
          const usernames = this.mentionService.extractMentionsWithParticipants(response.content, participants);
          if (usernames.length > 0) {
            const userMap = await this.mentionService.resolveUsernames(usernames);
            const resolved = [...userMap.values()].map((u) => u.id);
            if (resolved.length > 0) {
              mentionedUserIds = resolved;
            }
          }
        }
      }

      // Use MessagingService full pipeline: DB save + mention extraction + translation + broadcast
      const messageRequest = {
        conversationId: response.conversationId,
        content: response.content,
        originalLanguage: response.originalLanguage,
        messageType: 'text' as const,
        messageSource: 'agent' as const,
        replyToId: response.replyToId,
        mentionedUserIds,
        isAnonymous: false,
        metadata: { source: 'api' as const },
      };

      // Résout le Participant.id du sender AVANT d'appeler handleMessage — mirroring
      // handleAgentReaction just below. MessagingService attend un Participant.id ;
      // lui passer asUserId (un User.id) ne fonctionnait que via son fallback
      // DEPRECATED (query supplémentaire + log d'erreur à chaque réponse d'agent).
      const senderParticipant = await this.prisma.participant.findFirst({
        where: { userId: response.asUserId, conversationId: response.conversationId, isActive: true },
        select: { id: true },
      });
      if (!senderParticipant) {
        logger.warn(`[Agent] No active participant for userId=${response.asUserId} in conv=${response.conversationId}`);
        return;
      }

      const result = await this.messagingService.handleMessage(
        messageRequest,
        senderParticipant.id
      );

      if (!result.success || !result.data) {
        logger.error(`[Agent] handleMessage failed — conv=${response.conversationId}`, result.error);
        return;
      }

      // Broadcast to all members (translation arrives asynchronously via translationReady event)
      // Note: Notifications are already triggered inside messagingService.handleMessage -> processor.triggerAllNotifications
      const messageWithTimestamp = { ...result.data, timestamp: result.data.createdAt } as Message;
      await this._broadcastNewMessage(messageWithTimestamp, response.conversationId);

      logger.info(`[Agent] Response sent — conv=${response.conversationId} user=${response.asUserId} type=${response.metadata.agentType} msgId=${result.data.id}`);
    } catch (error) {
      logger.error('[Agent] handleAgentResponse error:', error);
    }
  }

  private async getConversationParticipantsForMention(
    conversationId: string
  ): Promise<import('@meeshy/shared/utils/mention-parser').MentionParticipant[]> {
    try {
      const participants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true, userId: { not: null } },
        select: {
          userId: true,
          displayName: true,
          user: {
            select: { id: true, username: true, displayName: true }
          }
        }
      });

      return participants
        .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user !== null)
        .map((p) => ({
          userId: p.user.id,
          username: p.user.username,
          displayName: p.user.displayName ?? p.user.username,
        }));
    } catch {
      return [];
    }
  }

  async handleAgentReaction(reaction: {
    type: 'agent:reaction';
    conversationId: string;
    asUserId: string;
    targetMessageId: string;
    emoji: string;
  }): Promise<void> {
    try {
      const participant = await this.prisma.participant.findFirst({
        where: { userId: reaction.asUserId, conversationId: reaction.conversationId, isActive: true },
        select: { id: true },
      });
      if (!participant) {
        logger.warn(`[Agent] No active participant for userId=${reaction.asUserId} in conv=${reaction.conversationId}`);
        return;
      }

      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const result = await reactionService.addReaction({
        messageId: reaction.targetMessageId,
        emoji: reaction.emoji,
        participantId: participant.id,
      });

      if (!result) {
        logger.warn(`[Agent] Reaction failed — conv=${reaction.conversationId} msg=${reaction.targetMessageId}`);
        return;
      }

      if (result.unchanged) {
        // Idempotent no-op: the agent already had exactly this emoji on the
        // message. Skip the REACTION_ADDED broadcast and author notification —
        // nothing changed. Parity with the human socket/REST add paths.
        logger.info(`[Agent] Reaction unchanged (already present) — conv=${reaction.conversationId} msg=${reaction.targetMessageId}`);
        return;
      }

      const updateEvent = await reactionService.createUpdateEvent(
        reaction.targetMessageId,
        reaction.emoji,
        'add',
        participant.id,
        reaction.conversationId,
        reaction.asUserId
      );

      const message = await this.prisma.message.findUnique({
        where: { id: reaction.targetMessageId },
        select: { conversationId: true, senderId: true },
      });

      if (message) {
        const normalizedConversationId = message.conversationId;
        // Multi-réactions (2026-08-18) : un add n'évince plus jamais un
        // emoji précédent — aucun retrait compensatoire à diffuser.
        this.io.to(ROOMS.conversation(normalizedConversationId)).emit(SERVER_EVENTS.REACTION_ADDED, updateEvent);
        // An agent's reaction is a reaction like any other: without this the
        // room emit is its only audience and the toggle is lost for every
        // participant offline at that instant.
        void this.enqueueOfflineReactionMutation({
          conversationId: normalizedConversationId,
          actorParticipantId: participant.id,
          eventType: 'reaction-added',
          messageId: reaction.targetMessageId,
          emoji: reaction.emoji,
          payload: updateEvent,
        });

        const authorParticipant = message.senderId
          ? await this.prisma.participant.findUnique({
              where: { id: message.senderId },
              select: { userId: true },
            })
          : null;
        const authorUserId = authorParticipant?.userId;
        if (authorUserId && authorUserId !== reaction.asUserId) {
          this.notificationService
            .createReactionNotification({
              messageAuthorId: authorUserId,
              reactorUserId: reaction.asUserId,
              messageId: reaction.targetMessageId,
              conversationId: normalizedConversationId,
              reactionEmoji: reaction.emoji,
            })
            .catch((error) => {
              logger.error('[Agent] Reaction notification error:', error);
            });
        }
      }

      logger.info(`[Agent] Reaction sent — conv=${reaction.conversationId} user=${reaction.asUserId} emoji=${reaction.emoji} msg=${reaction.targetMessageId}`);
    } catch (error) {
      logger.error('[Agent] handleAgentReaction error:', error);
    }
  }

  private async _resolveMentionUserIds(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];
    try {
      return await resolveUsernamesToIds(this.prisma, usernames);
    } catch {
      return [];
    }
  }

  private _notifyAgent(message: {
    id: string;
    conversationId: string;
    senderId: string | null;
    senderDisplayName?: string;
    senderUsername?: string;
    content: string | null;
    originalLanguage: string | null;
    replyToId?: string | null;
    mentionedUserIds?: string[];
    createdAt: Date;
  }): void {
    if (!this.agentClient || !message.senderId || !message.content) return;
    this.agentClient.sendEvent({
      type: 'agent:new-message',
      conversationId: message.conversationId,
      messageId: message.id,
      senderId: message.senderId,
      senderDisplayName: message.senderDisplayName,
      senderUsername: message.senderUsername,
      content: message.content,
      originalLanguage: message.originalLanguage ?? 'fr',
      replyToId: message.replyToId ?? undefined,
      mentionedUserIds: message.mentionedUserIds ?? [],
      timestamp: message.createdAt.getTime(),
    }).catch((err: unknown) => {
      logger.warn('[Agent] sendEvent error (non-blocking):', err);
    });
  }
}
