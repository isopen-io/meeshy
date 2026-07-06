/**
 * Gestionnaire Socket.IO pour Meeshy
 * Gestion des connexions, conversations et traductions en temps réel
 */

import { Server as SocketIOServer, type Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService, MessageData } from '../services/message-translation/MessageTranslationService';
import { transformTranslationsToArray } from '../utils/translation-transformer';
import { filterMessagePayloadForLanguages } from './utils/message-payload-filter';
import { applyResolvedLanguagesRefresh } from './utils/resolved-languages-refresh';
import { MaintenanceService } from '../services/MaintenanceService';
import { StatusService } from '../services/StatusService';
import { MessagingService } from '../services/MessagingService';
import { CallEventsHandler } from './CallEventsHandler';
import { SocialEventsHandler } from './handlers/SocialEventsHandler';
import { LocationHandler } from './handlers/LocationHandler';
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
import { ReactionService } from '../services/ReactionService.js';
import { CommentReactionService } from '../services/CommentReactionService';
import { PostReactionService } from '../services/PostReactionService';
import { MessageReadStatusService } from '../services/MessageReadStatusService.js';
import { EmailService } from '../services/EmailService';
import { PushNotificationService } from '../services/PushNotificationService';
import { NotificationService } from '../services/notifications/NotificationService';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService';
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
import { enhancedLogger } from '../utils/logger-enhanced';
import { BoundedTtlCache } from '../utils/bounded-cache';
import type { ZmqAgentClient } from '../services/zmq-agent/ZmqAgentClient';
import { MentionService } from '../services/MentionService';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

// Logger dédié pour SocketIOManager
const logger = enhancedLogger.child({ module: 'SocketIOManager' });

// Maps a queued entry's `eventType` (absent = legacy 'new') to the Socket.IO
// event replayed on reconnect for that offline-queue entry.
function _drainedEventName(eventType: QueuedMessagePayload['eventType']): string {
  if (eventType === 'edited') return SERVER_EVENTS.MESSAGE_EDITED;
  if (eventType === 'deleted') return SERVER_EVENTS.MESSAGE_DELETED;
  return SERVER_EVENTS.MESSAGE_NEW;
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
  private agentClient: ZmqAgentClient | null = null;
  private mentionService: MentionService;
  private deliveryQueue: RedisDeliveryQueue | null = null;
  private readStatusService!: MessageReadStatusService;

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

    // CORRECTION: Créer NotificationService AVANT MessagingService pour que les mentions génèrent des notifications
    this.notificationService = new NotificationService(prisma);
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
      io: this.io as SocketIOServer,
      prisma: this.prisma,
    });

    // Initialiser le LocationHandler pour les événements de partage de localisation
    this.locationHandler = new LocationHandler({
      io: this.io as SocketIOServer,
      prisma: this.prisma,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      normalizeConversationId: (id: string) => this.normalizeConversationId(id),
    });

    // Initialiser le PostAudioService singleton (dépend de socialEventsHandler)
    PostAudioService.init(this.prisma, this.socialEventsHandler);

    // Initialiser le StoryTextObjectTranslationService singleton
    StoryTextObjectTranslationService.init(this.prisma, this.io as SocketIOServer);

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
    });

    this.adminAgentHandler = new AdminAgentHandler({
      prisma: this.prisma,
      socketToUser: this.socketToUser,
    });

    const reactionService = new ReactionService(prisma);
    this.readStatusService = new MessageReadStatusService(prisma);
    const readStatusService = this.readStatusService;

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
    });

    this.statusHandler = new StatusHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      privacyPreferencesService: this.privacyPreferencesService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
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
    });
  }

  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
    // The WS `message:send` path (MessageHandler) enqueues offline recipients
    // itself, in parallel with this REST-path queue — same shared instance.
    this.messageHandler.setDeliveryQueue(queue);
  }

  private async _drainPendingMessages(socket: Socket, userId: string): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const pending = await this.deliveryQueue.drain(userId);
      if (pending.length === 0) return;

      logger.info(`Delivering ${pending.length} queued messages to ${userId}`);
      for (const entry of pending) {
        socket.emit(_drainedEventName(entry.eventType), entry.payload);
      }
      const affectedConversationIds = [...new Set(pending.map(e => e.conversationId))];
      socket.emit(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, { count: pending.length, conversationIds: affectedConversationIds });

      // Emit delivery receipts to senders so their checkmarks advance from
      // "sent" (single tick) to "delivered" (double tick) as soon as the
      // messages land on the recipient's device — matching WhatsApp / iMessage
      // behaviour instead of waiting for the user to open the conversation.
      this._emitDeliveryForDrainedMessages(userId, pending).catch(err => {
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
   * Respects the user's `showReadReceipts` privacy preference.
   * Batches the participant lookup across all affected conversations in a
   * single Prisma query to minimise round-trips on the reconnect path.
   */
  private async _emitDeliveryForDrainedMessages(
    userId: string,
    pending: QueuedMessagePayload[]
  ): Promise<void> {
    // Delivery receipts only make sense for actual new messages — an edited
    // or deleted entry replays its own event (see `_drainedEventName`) but
    // was never awaiting a "delivered" checkmark in the first place.
    const newEntries = pending.filter((entry) => (entry.eventType ?? 'new') === 'new');
    if (newEntries.length === 0) return;

    // Check privacy preference first — single cheap cached call.
    const prefMap = await this.privacyPreferencesService.getPreferencesForUsers([
      { id: userId, isAnonymous: false },
    ]);
    if (!prefMap.get(userId)?.showReadReceipts) return;

    // Group by conversationId, keeping the last (newest) messageId per conv
    // so we call markMessagesAsReceived once per conversation.
    const convLatest = new Map<string, string>();
    for (const entry of newEntries) {
      convLatest.set(entry.conversationId, entry.messageId);
    }

    // Batch-resolve participant rows for all affected conversations.
    const participantRows = await this.prisma.participant.findMany({
      where: { userId, conversationId: { in: [...convLatest.keys()] }, isActive: true },
      select: { id: true, conversationId: true },
    });

    await Promise.allSettled(
      participantRows.map(async ({ id: participantId, conversationId }) => {
        const latestMessageId = convLatest.get(conversationId);
        if (!latestMessageId) return;

        await this.readStatusService.markMessagesAsReceived(participantId, conversationId, latestMessageId);

        const summary = await this.readStatusService.getLatestMessageSummary(conversationId);
        this.io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.READ_STATUS_UPDATED, {
          conversationId,
          participantId,
          userId,
          type: 'received' as const,
          updatedAt: new Date(),
          summary,
        });
        logger.debug('drain delivery receipt emitted', { userId, conversationId, latestMessageId });
      })
    );
  }

  /**
   * Normalise l'identifiant de conversation pour créer une room cohérente
   * Résout identifier/ObjectId vers l'identifier canonique
   */
  private async normalizeConversationId(conversationId: string): Promise<string> {
    try {
      if (/^[0-9a-fA-F]{24}$/.test(conversationId)) return conversationId;
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
   * Émet `presence:snapshot` au socket fraîchement authentifié : liste les userIds
   * (ou participantIds anonymes) actuellement online parmi les contacts du nouvel
   * arrivant — c'est-à-dire les autres participants des conversations qu'il rejoint.
   * Permet au client de seed son store sans attendre qu'un changement d'état arrive
   * (closes la faille "ne se met jamais à jour" sur les contacts déjà connectés).
   */
  /**
   * Masque la présence des contacts selon leurs préférences privacy (cascade
   * showOnlineStatus maître + showLastSeen). Anonymes → défaut (montrés).
   * Appliqué à l'émission (pas au cache) pour couvrir aussi le cache-hit.
   */
  private async _applyPresencePrefs(
    users: { userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }[],
  ): Promise<{ userId: string; username: string; isOnline: boolean; lastActiveAt: Date | null }[]> {
    if (users.length === 0) return users;
    const prefsMap = await this.privacyPreferencesService.getPreferencesForUsers(
      users.map(u => ({ id: u.userId, isAnonymous: false })),
    );
    return users.map(u => {
      const p = prefsMap.get(u.userId);
      if (p && !p.showOnlineStatus) return { ...u, isOnline: false, lastActiveAt: null };
      return { ...u, lastActiveAt: p && !p.showLastSeen ? null : u.lastActiveAt };
    });
  }

  private async _emitPresenceSnapshot(socket: Socket, userId: string, isAnonymous: boolean): Promise<void> {
    try {
      const cached = this.presenceSnapshotCache.get(userId);
      if (cached && Date.now() - cached.cachedAt < this.PRESENCE_SNAPSHOT_CACHE_TTL_MS) {
        const users = await this._applyPresencePrefs(
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
          socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, { users: await this._applyPresencePrefs(users) });
          logger.info(`📸 [PRESENCE_SNAPSHOT] ${users.length} contacts sent to ${userId} (${users.filter(u => u.isOnline).length} online)`);
        }
      }

      // Drain offline delivery queue regardless of snapshot cache hit/miss.
      // Previously this only ran on the non-cached path — on quick reconnects
      // (within the 30s TTL) queued messages were silently dropped.
      if (!isAnonymous) {
        this._drainPendingMessages(socket, userId).catch(err => {
          logger.warn('Failed to drain pending messages on connect', { userId, error: err });
        });
        this._emitUnreadCountsSnapshot(socket, userId).catch(err => {
          logger.warn('Failed to emit unread counts snapshot on reconnect', { userId, error: err });
        });
      }
    } catch (error) {
      logger.error('❌ [PRESENCE_SNAPSHOT] Failed to build snapshot', error);
    }
  }

  private async _emitUnreadCountsSnapshot(socket: Socket, userId: string): Promise<void> {
    try {
      const participantRows = await this.prisma.participant.findMany({
        where: { userId, isActive: true },
        select: { conversationId: true },
      });
      if (participantRows.length === 0) return;
      const conversationIds = participantRows.map(p => p.conversationId);
      const unreadCounts = await this.readStatusService.getUnreadCountsForUser(userId, conversationIds);
      for (const [conversationId, unreadCount] of unreadCounts) {
        socket.emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId, unreadCount });
      }
    } catch (error) {
      logger.warn('unread counts snapshot failed on reconnect', { userId, error });
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

      socket.on(CLIENT_EVENTS.LOCATION_SHARE, async (data, callback) => {
        try { await this.locationHandler.handleLocationShare(socket, data, callback); } catch (error) { logger.error('[LOCATION_SHARE] Error:', error); callback?.({ success: false, error: 'Internal server error' }); }
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
        const disconnectingUserId = this.socketToUser.get(socket.id);
        if (disconnectingUserId) {
          // Build the set of OTHER sockets for this user (excluding the one
          // that is disconnecting). Passed to handleSocketDisconnecting so it
          // can suppress typing:stop broadcasts for conversations where the
          // user is still typing on another device — prevents false indicator
          // flicker when a user has multiple active sessions.
          const allUserSockets = this.userSockets.get(disconnectingUserId) ?? new Set<string>();
          const otherSocketIds = new Set([...allUserSockets].filter(sid => sid !== socket.id));
          this.statusHandler.handleSocketDisconnecting(
            socket.id,
            (room, event, data) => {
              // event is always SERVER_EVENTS.TYPING_STOP — cast bypasses union exhaustiveness check
              this.io.to(room).emit(event as keyof ServerToClientEvents, data as any);
            },
            otherSocketIds.size > 0 ? otherSocketIds : undefined
          );
        }
      });

      socket.on('disconnect', (reason: string) => {
        logger.debug('socket disconnect', { socketId: socket.id, reason });
        const disconnectedUserId = this.socketToUser.get(socket.id);
        if (disconnectedUserId) {
          // Drain active typing state BEFORE invalidating cache: broadcasts
          // typing:stop to every conversation the user was typing in so
          // clients clear the indicator immediately (vs waiting up to 15s for
          // their safety timer). drainActiveTypingState also clears the
          // throttle map entries, superseding the old clearTypingThrottle call.
          const { conversationIds, identity } = this.statusHandler.drainActiveTypingState(disconnectedUserId);
          if (conversationIds.length > 0 && identity) {
            for (const convId of conversationIds) {
              this.io.to(ROOMS.conversation(convId)).emit(SERVER_EVENTS.TYPING_STOP, {
                userId: disconnectedUserId,
                username: identity.username,
                displayName: identity.displayName,
                conversationId: convId,
                isTyping: false
              });
            }
          }
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
      
      
      // Récupérer la traduction (depuis le cache ou la base de données)
      const translation = await this.translationService.getTranslation(data.messageId, data.targetLanguage);
      
      if (translation) {
        socket.emit(SERVER_EVENTS.MESSAGE_TRANSLATION, {
          messageId: data.messageId,
          translatedText: translation.translatedText,
          targetLanguage: data.targetLanguage,
          confidenceScore: translation.confidenceScore
        });

        this.stats.translations_sent++;

      } else {
        // No cached translation — trigger on-demand translation via ZMQ
        try {
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
      
      
      // Récupérer la conversation du message pour broadcast
      let conversationIdForBroadcast: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: result.messageId },
          select: { conversationId: true }
        });
        conversationIdForBroadcast = msg?.conversationId || null;
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation:`, error);
      }
      
      // Préparer les données de traduction au format correct pour le frontend
      // FORMAT: TranslationEvent avec un tableau de traductions
      const translationData: TranslationEvent = {
        messageId: result.messageId,
        translations: [{
          id: data.translationId || data.id || `${result.messageId}_${targetLanguage}_${Date.now()}`,
          messageId: result.messageId,
          sourceLanguage: result.sourceLanguage || 'auto',
          targetLanguage: targetLanguage,
          translatedContent: result.translatedText,
          translationModel: result.translationModel || result.modelType || 'medium',
          cacheKey: `${result.messageId}_${result.sourceLanguage || 'auto'}_${targetLanguage}`,
          cached: false,
          confidenceScore: result.confidenceScore || 0.85,
          createdAt: new Date()
        }]
      };
      
      
      // Diffuser dans la room de conversation (méthode principale et UNIQUE)
      if (conversationIdForBroadcast) {
        // Normaliser l'ID de conversation
        const normalizedId = await this.normalizeConversationId(conversationIdForBroadcast);
        const roomName = ROOMS.conversation(normalizedId);
        const roomClients = this.io.sockets.adapter.rooms.get(roomName);
        const clientCount = roomClients ? roomClients.size : 0;
        
        
        this.io.to(roomName).emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
        this.stats.translations_sent += clientCount;
        
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
      emitAttachmentUpdated(
        this.io,
        normalizedConversationId,
        messageId,
        fresh as Record<string, unknown>
      );
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
      this.io.to(roomName).emit(eventConstant, translationData);
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

  private _findUsersForLanguage(targetLanguage: string): SocketUser[] {
    const lang = targetLanguage.toLowerCase();
    const targetUsers: SocketUser[] = [];

    for (const [, user] of this.connectedUsers) {
      const matches =
        user.resolvedLanguages.includes(lang) ||
        user.language.toLowerCase() === lang;
      if (matches) {
        targetUsers.push(user);
      }
    }

    return targetUsers;
  }

  /**
   * Phase B1 — emit `message:new` to a conversation room grouped by each
   * recipient's preferred language, sending a translation-trimmed payload once
   * per distinct language. Recipients whose language is unknown fall back to the
   * message's original language. Opt-in via `SOCKET_LANG_FILTER=true` (OFF by
   * default). Pure trimming is
   * delegated to `filterMessagePayloadForLanguages` (unit-tested).
   */
  private _emitMessageNewByLanguage(room: string, payload: Record<string, any>): void {
    const socketIds = this.io.sockets.adapter.rooms.get(room);
    if (!socketIds || socketIds.size === 0) return;

    const originalLanguage = String(payload.originalLanguage || 'fr').toLowerCase();
    const socketsByLanguageKey = new Map<string, { socketIds: string[]; langs: string[] }>();
    for (const socketId of socketIds) {
      const userId = this.socketToUser.get(socketId);
      const socketUser = userId ? this.connectedUsers.get(userId) : undefined;
      const langs: string[] =
        socketUser && socketUser.resolvedLanguages.length > 0
          ? socketUser.resolvedLanguages
          : [String(socketUser?.language || originalLanguage).toLowerCase()];
      const key = langs.join(',');
      const bucket = socketsByLanguageKey.get(key);
      if (bucket) bucket.socketIds.push(socketId);
      else socketsByLanguageKey.set(key, { socketIds: [socketId], langs });
    }

    for (const { socketIds: socketsForLangs, langs } of socketsByLanguageKey.values()) {
      if (socketsForLangs.length === 0) continue;
      const filtered = filterMessagePayloadForLanguages(payload, [...langs, originalLanguage]);
      const [firstSid, ...restSids] = socketsForLangs;
      let emitter: ReturnType<SocketIOServer['to']> = this.io.to(firstSid);
      for (const socketId of restSids) emitter = emitter.to(socketId);
      emitter.emit(SERVER_EVENTS.MESSAGE_NEW, filtered);
    }
  }

  /**
   * CORRECTION: Broadcaster le changement de statut d'un utilisateur à tous les clients
   * PRIVACY: Respecte les préférences showOnlineStatus et showLastSeen
   */
  private async _broadcastUserStatus(userId: string, isOnline: boolean, isAnonymous: boolean): Promise<void> {
    try {
      // PRIVACY: Vérifier les préférences de confidentialité de l'utilisateur
      const privacyPrefs = await this.privacyPreferencesService.getPreferences(userId, isAnonymous);

      // Si l'utilisateur a désactivé showOnlineStatus, ne pas broadcaster son statut
      if (!privacyPrefs.showOnlineStatus) {
        return;
      }

      // Récupérer les informations de l'utilisateur pour le broadcast
      if (isAnonymous) {
        // userId is participantId for anonymous
        const participant = await this.prisma.participant.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            nickname: true,
            lastActiveAt: true,
            conversationId: true
          }
        });

        if (participant) {
          const displayName = participant.nickname || participant.displayName;

          // PRIVACY: Ne pas envoyer lastActiveAt si showLastSeen est désactivé
          const lastActiveAt = privacyPrefs.showLastSeen ? participant.lastActiveAt : null;

          // Broadcaster uniquement dans la conversation du participant anonyme
          this.io.to(ROOMS.conversation(participant.conversationId)).emit(SERVER_EVENTS.USER_STATUS, {
            userId: participant.id,
            username: displayName,
            isOnline,
            lastActiveAt
          });

        }
      } else {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            lastActiveAt: true
          }
        });

        if (user) {
          const displayName = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username;

          // PRIVACY: Ne pas envoyer lastActiveAt si showLastSeen est désactivé
          const lastActiveAt = privacyPrefs.showLastSeen ? user.lastActiveAt : null;

          // Find all conversations this user participates in
          const participantRows = await this.prisma.participant.findMany({
            where: { userId: user.id, isActive: true },
            select: { conversationId: true }
          });

          // Broadcaster dans toutes les conversations de l'utilisateur (batch: 1 emit au lieu de N)
          const rooms = participantRows.map(p => ROOMS.conversation(p.conversationId));
          if (rooms.length > 0) {
            this.io.to(rooms).emit(SERVER_EVENTS.USER_STATUS, {
              userId: user.id,
              username: displayName,
              isOnline,
              lastActiveAt
            });
          }

        }
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
      const messagePayload = {
        id: message.id,
        conversationId: normalizedId,  // ← FIX: Toujours utiliser l'ObjectId normalisé
        senderId: resolvedSenderId,
        content: message.content,
        originalLanguage: message.originalLanguage || 'fr',
        originalContent: (message as unknown as Record<string, unknown>)['originalContent'] as string | undefined || message.content,
        messageType: (message.messageType || 'text') as MessageType,
        messageSource: message.messageSource || undefined,
        metadata: message.metadata || undefined,
        isEdited: Boolean(message.isEdited),
        deletedAt: message.deletedAt || undefined,
        isBlurred: Boolean(message.isBlurred),
        isViewOnce: Boolean(message.isViewOnce),
        effectFlags: (message as unknown as Record<string, unknown>)['effectFlags'] ?? 0,
        expiresAt: message.expiresAt || undefined,
        createdAt: message.createdAt || new Date(),
        updatedAt: message.updatedAt || new Date(),
        validatedMentions: message.validatedMentions ?? [],
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
        replyToId: message.replyToId || undefined,
        replyTo: message.replyTo ? {
          id: message.replyTo.id,
          conversationId: normalizedId,
          senderId: message.replyTo.senderId || undefined,
          content: message.replyTo.content,
          originalLanguage: message.replyTo.originalLanguage || 'fr',
          messageType: (message.replyTo.messageType || 'text') as MessageType,
          createdAt: message.replyTo.createdAt || new Date(),
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
        } : undefined,
      };

      if (message.attachments && message.attachments.length > 0) {
        const first = message.attachments[0] as unknown as Record<string, unknown>;
        const firstMeta = typeof first['metadata'] === 'object' && first['metadata'] ? first['metadata'] as Record<string, unknown> : null;
        logger.debug(`message:new broadcast messageId=${message.id} attachments=${message.attachments.length}`);
      }

      // COMPORTEMENT SIMPLE ET FIABLE DE L'ANCIENNE MÉTHODE
      const room = ROOMS.conversation(normalizedId);
      // 1. Broadcast vers tous les clients de la conversation.
      //
      // Bandwidth sprint Phase B1 — per-language filtered broadcast.
      // Groups room sockets by preferred language (zero DB query, from connectedUsers map)
      // and sends a trimmed payload once per distinct language. Original content preserved.
      // Opt-in (OFF by default): enable explicitly with SOCKET_LANG_FILTER=true once
      // validated in staging (measured savings + multi-device + Prisme fallback check).
      if (process.env.SOCKET_LANG_FILTER === 'true') {
        this._emitMessageNewByLanguage(room, messagePayload);
      } else {
        this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      }

      // 2. S'assurer que l'auteur reçoit aussi (au cas où il ne serait pas dans la room encore)
      if (senderSocket) {
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      } else {
      }

      // 2b. Emit mention:created to each mentioned user's personal room
      const mentions = message.validatedMentions as unknown as Array<{ participantId?: string; userId?: string; username?: string }> | undefined;
      if (mentions && mentions.length > 0) {
        for (const mention of mentions) {
          const targetUserId = mention.userId;
          if (targetUserId && targetUserId !== message.senderId) {
            this.io.to(ROOMS.user(targetUserId)).emit(SERVER_EVENTS.MENTION_CREATED, {
              messageId: message.id,
              conversationId: normalizedId,
              senderId: message.senderId,
              mentionedUserId: targetUserId,
              mentionedParticipantId: mention.participantId,
              content: message.content,
              timestamp: new Date().toISOString(),
            });
          }
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
          const allParticipants = await this.prisma.participant.findMany({
            where: {
              conversationId: normalizedId,
              isActive: true
            },
            select: { id: true, userId: true, joinedAt: true }
          });

          // CONVERSATION_UPDATED → room user de CHAQUE participant (re-tri liste).
          // `updatedBy` est requis par ConversationUpdatedEventData (this.io est typé,
          // contrairement à MessageHandler) : c'est l'auteur du message qui déclenche
          // le bump (resolvedSenderId = User.id du sender, fallback participant id).
          const updatePayload = {
            conversationId: normalizedId,
            updatedBy: { id: resolvedSenderId ?? message.senderId ?? '' },
            lastMessageAt: message.createdAt || new Date(),
            lastMessageId: message.id,
            lastMessagePreview: message.content,
            senderId: message.senderId,
            updatedAt: new Date().toISOString()
          };
          for (const p of allParticipants) {
            if (!p.userId) continue;
            this.io.to(ROOMS.user(p.userId)).emit(SERVER_EVENTS.CONVERSATION_UPDATED, updatePayload);
          }

          // Badge non-lu → destinataires uniquement (exclure l'expéditeur in-process)
          const participants = allParticipants.filter((p) => p.id !== senderId);

          // Calculer le unreadCount pour tous les participants en batch (1 query au lieu de N)
          const readStatusService = this.readStatusService;

          const unreadCountMap = await readStatusService.getUnreadCountsForParticipants(participants, normalizedId);

          const connectedUserIds = new Set(this.getConnectedUsers());

          for (const participant of participants) {
            const roomTarget = participant.userId || participant.id;
            const unreadCount = unreadCountMap.get(participant.id) ?? 0;

            this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
              conversationId: normalizedId,
              unreadCount
            });

            // 5.3 SCOPE — le filtre SOCKET_LANG_FILTER s'applique au message:new
            // ONLINE uniquement. L'enqueue offline ci-dessous stocke le payload
            // complet (multi-traduit), NON filtré par langue. Acceptable car le
            // chemin principal `message:send` (MessageHandler) n'enqueue pas offline.
            // Le drain (`_drainPendingMessages`) EST câblé : il s'exécute sur
            // connexion (post-auth, post-room-join) — voir l'appel ~ligne 521.
            // Le destinataire reconnecté rejoue donc ces messages au prochain login.
            if (this.deliveryQueue && !connectedUserIds.has(roomTarget)) {
              this.deliveryQueue.enqueue(roomTarget, {
                messageId: message.id,
                conversationId: normalizedId,
                payload: messagePayload as Record<string, unknown>,
                enqueuedAt: new Date().toISOString(),
              }).catch(err => logger.warn('Failed to enqueue message for offline user', { userId: roomTarget, error: err }));
            }
          }
        }
      } catch (syncError) {
        logger.warn('⚠️ [CONV_SYNC] Erreur sync liste conversations (non-bloquant):', syncError);
      }

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
      systemLanguage: string;
      regionalLanguage?: string | null;
      customDestinationLanguage?: string | null;
      deviceLocale?: string | null;
    }
  ): void {
    applyResolvedLanguagesRefresh(this.connectedUsers, userId, prefs);
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
   * Vérifie si un utilisateur est dans une salle de conversation
   */
  isUserInConversationRoom(userId: string, conversationId: string): boolean {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        return socket.rooms.has(`conversation:${conversationId}`);
      }
    }
    return false;
  }


  /**
   * Déconnecte un utilisateur spécifique
   */
  disconnectUser(userId: string): boolean {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.disconnect(true);
        return true;
      }
    }
    return false;
  }

  /**
   * Envoie une notification à un utilisateur spécifique
   */
  sendToUser<K extends keyof ServerToClientEvents>(
    userId: string, 
    event: K, 
    ...args: Parameters<ServerToClientEvents[K]>
  ): boolean {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.emit(event, ...args);
        return true;
      }
    }
    return false;
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
        const users = await this.prisma.user.findMany({
          where: { username: { in: response.mentionedUsernames.map((u) => u.toLowerCase()) } },
          select: { id: true },
        });
        if (users.length > 0) {
          mentionedUserIds = users.map((u) => u.id);
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

      const updateEvent = await reactionService.createUpdateEvent(
        reaction.targetMessageId,
        reaction.emoji,
        'add',
        participant.id,
        reaction.conversationId
      );

      const message = await this.prisma.message.findUnique({
        where: { id: reaction.targetMessageId },
        select: { conversationId: true, senderId: true },
      });

      if (message) {
        const normalizedConversationId = message.conversationId;
        // Swap 1-réaction-par-user : broadcast du retrait de l'ancien emoji de
        // l'agent avant l'ajout du nouveau.
        for (const removedEmoji of result.replacedEmojis) {
          const removeEvent = await reactionService.createUpdateEvent(
            reaction.targetMessageId,
            removedEmoji,
            'remove',
            participant.id,
            normalizedConversationId
          );
          this.io.to(ROOMS.conversation(normalizedConversationId)).emit(SERVER_EVENTS.REACTION_REMOVED, removeEvent);
        }
        this.io.to(ROOMS.conversation(normalizedConversationId)).emit(SERVER_EVENTS.REACTION_ADDED, updateEvent);

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
      const users = await this.prisma.user.findMany({
        where: { username: { in: usernames.map((u) => u.toLowerCase()) } },
        select: { id: true },
      });
      return users.map((u) => u.id);
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
