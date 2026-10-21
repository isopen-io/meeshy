import Foundation
import SocketIO
import Combine
import os

// MARK: - Message Socket Manager

// unchecked: tout l'état mutable n'est touché que sur la file principale (`.handleQueue(.main)` + `Task { @MainActor }`).
// La façade reste non isolée : StoryPublishQueue, OutboxDrainTriggers, CacheCoordinator, ConversationSyncEngine et
// LocationService la lisent hors MainActor — migration portée par #11530, préalable au @MainActor de type.
public final class MessageSocketManager: ObservableObject, MessageSocketProviding, @unchecked Sendable {
    public static let shared = MessageSocketManager()

    // Combine publishers — messages
    public let messageReceived = PassthroughSubject<APIMessage, Never>()
    public let messageEdited = PassthroughSubject<APIMessage, Never>()
    public let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()
    public let messageExpired = PassthroughSubject<MessageExpiredEvent, Never>()
    public let messageCitedPostWithdrawn = PassthroughSubject<MessageCitedPostWithdrawnEvent, Never>()
    public let messageCountdownStarted = PassthroughSubject<MessageCountdownStartedEvent, Never>()
    public let messageHiddenForMe = PassthroughSubject<MessageHiddenForMeEvent, Never>()
    public let messageRestoredForMe = PassthroughSubject<MessageRestoredForMeEvent, Never>()
    public let messagePinned = PassthroughSubject<MessagePinnedEvent, Never>()
    public let messageUnpinned = PassthroughSubject<MessageUnpinnedEvent, Never>()
    public let messageStarred = PassthroughSubject<MessageStarredEvent, Never>()

    // Combine publishers — reactions
    public let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    // BUG2 A' — réactions par-image
    public let attachmentReactionAdded = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()
    public let attachmentReactionRemoved = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()

    // Combine publishers — typing
    public let typingStarted = PassthroughSubject<TypingEvent, Never>()
    public let typingStopped = PassthroughSubject<TypingEvent, Never>()
    public let conversationViewing = PassthroughSubject<ConversationViewingEvent, Never>()
    public let conversationEngagementUpdated = PassthroughSubject<ConversationEngagementSnapshot, Never>()

    // Combine publishers — presence
    public let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    public let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()
    public let presenceSnapshotReceived = PassthroughSubject<PresenceSnapshotEvent, Never>()

    // Combine publishers — read status
    public let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()
    public let pendingMessagesDelivered = PassthroughSubject<PendingMessagesDeliveredEvent, Never>()

    // Combine publishers — attachment status
    public let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusUpdatedEvent, Never>()
    public let attachmentUpdated = PassthroughSubject<AttachmentUpdatedEvent, Never>()

    // Combine publishers — conversation participation
    public let conversationJoined = PassthroughSubject<ConversationParticipationEvent, Never>()
    public let conversationJoinError = PassthroughSubject<ConversationJoinErrorEvent, Never>()
    public let conversationLeft = PassthroughSubject<ConversationParticipationEvent, Never>()

    // Combine publishers — participant role
    public let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
    /// Un hôte a modifié les droits d'un visiteur sans compte. Distinct du
    /// rôle : ce que la personne a le droit de FAIRE change, pas son rang.
    public let participantRightsUpdated = PassthroughSubject<ParticipantRightsUpdatedEvent, Never>()

    // Combine publishers — conversation & participant lifecycle
    public let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
    public let participantJoined = PassthroughSubject<ParticipantJoinedEvent, Never>()
    public let participantSelfLeft = PassthroughSubject<ParticipantLeftEvent, Never>()
    public let participantBanned = PassthroughSubject<ParticipantBannedEvent, Never>()
    public let participantUnbanned = PassthroughSubject<ParticipantUnbannedEvent, Never>()
    public let conversationClosed = PassthroughSubject<ConversationClosedEvent, Never>()

    // Combine publishers — user preferences
    public let userPreferencesUpdated = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
    public let userPreferencesConversationUpdated = PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never>()
    public let userPreferencesReordered = PassthroughSubject<UserPreferencesReorderedSocketEvent, Never>()
    public let conversationDeleted = PassthroughSubject<ConversationDeletedSocketEvent, Never>()
    public let conversationRestored = PassthroughSubject<ConversationRestoredSocketEvent, Never>()

    // Combine publishers — profil public d'un CONTACT
    public let userUpdated = PassthroughSubject<UserUpdatedEvent, Never>()

    // Combine publishers — user conversation categories
    public let categoryCreated = PassthroughSubject<CategorySocketEvent, Never>()
    public let categoryUpdated = PassthroughSubject<CategorySocketEvent, Never>()
    public let categoryDeleted = PassthroughSubject<CategoryDeletedSocketEvent, Never>()
    public let categoriesReordered = PassthroughSubject<CategoriesReorderedSocketEvent, Never>()

    // Combine publishers — conversation stats
    public let conversationStatsReceived = PassthroughSubject<ConversationStatsEvent, Never>()

    // Combine publishers — view-once
    public let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()
    public let viewOncePurged = PassthroughSubject<ViewOncePurgedEvent, Never>()

    // Combine publishers — location sharing
    public let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    public let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    public let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()

    // Combine publishers — translation
    public let translationReceived = PassthroughSubject<TranslationEvent, Never>()

    // Combine publishers — transcription & audio
    public let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    public let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()
    public let translationFailed = PassthroughSubject<TranslationFailedEvent, Never>()
    public let audioTranslationFailed = PassthroughSubject<AudioTranslationFailedEvent, Never>()
    public let transcriptionFailed = PassthroughSubject<TranscriptionFailedEvent, Never>()

    // Combine publisher — reconnection (fires after successful reconnect)
    public let didReconnect = PassthroughSubject<Void, Never>()

    // Combine publisher — heartbeat RTT (fires after each heartbeat:ack with ms value)
    public let connectionRTT = PassthroughSubject<Double, Never>()

    // Combine publishers — notifications
    public let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let conversationNew = PassthroughSubject<ConversationNewEvent, Never>()
    public let notificationRead = PassthroughSubject<NotificationReadEvent, Never>()
    public let notificationDeleted = PassthroughSubject<NotificationDeletedEvent, Never>()
    public let notificationCounts = PassthroughSubject<NotificationCountsEvent, Never>()
    public let notificationReadBulk = PassthroughSubject<NotificationReadBulkEvent, Never>()
    public let notificationDeletedBulk = PassthroughSubject<NotificationDeletedBulkEvent, Never>()

    // Combine publishers — call signaling
    public let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    public let callSignalOfferReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    public let callEnded = PassthroughSubject<CallEndData, Never>()
    public let callMissed = PassthroughSubject<CallMissedData, Never>()
    public let callAlreadyAnswered = PassthroughSubject<CallAlreadyAnsweredData, Never>()
    public let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    /// Last `call:participant-joined` event received, so the initiator's listener
    /// (set up only after the call:initiate ACK) can replay an event that arrived
    /// before it subscribed (callee already in the room). Matched by callId, so a
    /// stale event from a previous call is naturally ignored.
    public internal(set) var lastCallParticipantJoined: CallParticipantData?
    public let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    public let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    public let callError = PassthroughSubject<CallErrorData, Never>()
    public let callIceServersRefreshed = PassthroughSubject<CallIceServersRefreshedData, Never>()
    public let callQualityAlert = PassthroughSubject<CallQualityAlertData, Never>()
    public let callScreenCaptureAlert = PassthroughSubject<CallScreenCaptureAlertData, Never>()
    public let callForcedLeave = PassthroughSubject<CallForcedLeaveData, Never>()
    public let callTranslatedSegmentReceived = PassthroughSubject<CallTranslatedSegmentData, Never>()
    public let callTranscriptionActiveReceived = PassthroughSubject<CallTranscriptionActiveData, Never>()

    // Combine publishers — reactions sync, attachments, mentions
    public let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    public let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    // The currently active (foreground) conversation for priority re-join
    public var activeConversationId: String?

    /// Multi-fenêtre : TOUTES les conversations qu'une scène affiche — rejointes en tête à la reconnexion, la plus
    /// récente (`activeConversationId`) d'abord. Tenu par `NotificationToastManager`, seul porteur des ouvertures.
    public var openConversationIds: Set<String> = []

    private var manager: SocketManager?
    /// Interne (plus `private`) : l'émission des messages vit dans
    /// `MessageSocketManager+Send.swift`, extension d'un autre fichier, qui
    /// doit joindre le socket. Aucune isolation ne change — même classe,
    /// même module, mêmes appelants.
    var socket: SocketIOClient?
    /// #10904 — le jeton de compte présenté au handshake du socket courant
    /// (`nil` pour un invité). `auth:token-expired` rafraîchit en SON nom :
    /// jamais la session d'un compte ouvert depuis.
    private(set) var handshakeToken: String?
    private var joinedConversations: Set<String> = []
    private var reconnectAttempt: Int = 0
    private var backoff = SocketReconnectBackoff()
    private var reconnectTask: Task<Void, Never>?
    private var hadPreviousConnection = false
    private let heartbeat = SocketHeartbeat()
    private let transportRetirement = SocketTransportRetirement()
    private var translationBuffer = TranslationRequestBuffer()
    private var lifecycleCancellables = Set<AnyCancellable>()

    private init() {
        observeNetworkRecovery()
    }

    /// Source unique de vérité réseau : quand `NetworkMonitor` repasse en
    /// ligne, forcer une reconnexion socket immédiate. Évite que la bannière
    /// "Reconnexion..." persiste pendant que Socket.IO attend sa propre
    /// boucle de retry (qui peut tarder après une coupure prolongée — iOS
    /// kille silencieusement la WebSocket en arrière-plan).
    private func observeNetworkRecovery() {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleNetworkBackOnline()
            }
            .store(in: &lifecycleCancellables)
    }

    private func handleNetworkBackOnline() {
        guard !isConnected else { return }
        guard APIClient.shared.authToken != nil else { return }
        // The network coming back is fresh positive evidence about the LINK, not
        // about the server: a ladder built up by earlier outages must not defer
        // this attempt. (`SocialSocketManager` reconnects immediately on the same
        // signal — resetting here keeps the two policies aligned.)
        backoff.reset()
        scheduleReconnectWithBackoff()
    }

    private func scheduleReconnectWithBackoff() {
        // Only worth retrying while a session still exists. A nil token means the
        // server invalidated us (`requireReauthentication` clears it) and no amount
        // of retrying helps — only a fresh login does. An EXPIRED token is a
        // different story and must keep retrying: that is the post-outage case this
        // ladder exists for.
        guard APIClient.shared.authToken != nil else {
            Logger.socket.info("MessageSocket: no session — not arming a reconnect retry")
            return
        }
        reconnectTask?.cancel()
        let delay = backoff.nextDelay(jitter: SocketReconnectBackoff.randomJitter())
        let attempt = backoff.attempt
        Logger.socket.info("MessageSocket: backoff reconnect attempt=\(attempt) delay=\(delay, format: .fixed(precision: 2))s")
        reconnectTask = Task { [weak self] in
            guard await cancellableSleep(for: .seconds(delay)) else { return }
            await MainActor.run { [weak self] in
                guard let self, !self.isConnected else { return }
                self.forceReconnect()
            }
        }
    }

    // MARK: - Connection

    public func connect() {
        establishTransport()
    }

    /// The real `connect()`, reporting whether a live transport now exists.
    ///
    /// Every early return below leaves `socket`/`manager` nil. That is harmless
    /// on a cold start, but NOT when reached from `forceReconnect()`: that path
    /// runs `suspendTransport()` first, which destroys Socket.IO's own infinite
    /// retry loop. A `.notArmed` outcome there means the app is left with no
    /// transport and nothing retrying — so the caller has to arm the backoff
    /// ladder. See `forceReconnect()`.
    @discardableResult
    func establishTransport() -> SocketConnectOutcome {
        // Ne JAMAIS reconstruire le socket tant qu'une connexion existe ou est
        // en cours. Réassigner `manager`/`socket` relâche l'instance courante
        // en plein handshake : la connexion n'aboutit alors jamais et tous les
        // emits échouent avec « Tried emitting when not connected ».
        if let socket, socket.status == .connected || socket.status == .connecting {
            return .armed
        }

        guard let token = APIClient.shared.authToken else {
            Logger.socket.warning("No auth token, skipping connect")
            return .notArmed
        }

        let tokenExpired = SocketConnectionRules.isJWTExpired(token)
        if tokenExpired {
            Logger.socket.warning("MessageSocket: JWT expired, triggering refresh instead of connecting")
            // #10904 — au nom du jeton lu ici : il ne rafraîchit rien s'il
            // n'est plus celui du compte actif quand la tâche s'exécute.
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized(presentedToken: token)
            }
            // The refresh is fire-and-forget and gives up silently on a transient
            // network error — very likely right after an outage, which is exactly
            // when we land here. Without a scheduled retry the app would stay dark
            // with a valid session in the keychain.
            return .notArmed
        }

        guard let url = SocketConfig.baseURL else { return .notArmed }

        Task { @MainActor in self.connectionState = .connecting }

        manager = makeTransport(url: url, token: token)

        socket = manager?.defaultSocket
        handshakeToken = token
        setupEventHandlers()
        socket?.connect(withPayload: ClientInfoProvider.socketAuthPayload())
        return .armed
    }

    private func makeTransport(url: URL, token: String) -> SocketManager {
        return SocketManager(socketURL: url, config: [
            .log(false),
            .handleQueue(.main),
            // CALL-FIX 2026-06-06 — WebSocket transport (polling handshake → auto
            // upgrade to WebSocket). The previous `.forcePolling(true)` (HTTP
            // long-poll ONLY) dropped mid-call: every re-poll under WebRTC CPU load
            // surfaced as "transport close" on the gateway, killing call:initiate /
            // SDP / ICE signaling (call stuck on "connecting"). The old "~35s the WS
            // dropped" was a ping timeout (gateway pingTimeout was 10s) — bumped to
            // 20s server-side, so the persistent WebSocket now holds.
            //
            // P4-1 évalué 2026-08-22 puis ÉCARTÉ : `.forceWebsockets(true)`
            // économiserait 1-2 RTT par connect mais supprime le REPLI polling
            // — contrairement au web (`transports: ['websocket','polling']`,
            // WS d'abord AVEC repli), un réseau qui casse l'upgrade WebSocket
            // (proxy TLS-inspectant, portail captif) perdrait tout temps réel.
            // À reconsidérer seulement avec un repli après N échecs.
            // Le jeton de SESSION voyage AVEC le JWT (#4213).
            //
            // Un socket inscrit s'authentifiait au JWT seul, et le serveur
            // n'avait donc aucun moyen de dire quel socket appartient à quelle
            // session : révoquer une session passait la ligne à
            // `isValid: false` et cet appareil continuait de tout recevoir —
            // `message:new`, `conversation:updated` — indéfiniment, un socket
            // n'étant authentifié qu'une fois, au connect, et jamais revérifié.
            //
            // En EN-TÊTE, comme le JWT et comme les appels REST : le serveur le
            // lit par `extractSessionToken`, qui accepte l'en-tête
            // `x-session-token` aussi bien que `handshake.auth`.
            .extraHeaders(Self.handshakeHeaders(token: token, sessionToken: APIClient.shared.registeredSessionToken)),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
            // BW-IOS-01 — negocie l'extension `permessage-deflate`. Le gateway
            // l'annonce depuis toujours (`perMessageDeflate`, seuil 256 o) mais
            // Starscream ne pose l'en-tete d'extension que si le manager le
            // demande : sans ce drapeau, TOUTES les trames iOS voyageaient non
            // compressees. Un intermediaire qui casserait l'extension fait
            // retomber le handshake sur des trames nues, jamais sur une
            // deconnexion.
            .compress,
        ])
    }

    private func setupEventHandlers() {
        guard let socket else { return }
        installConnectionHandlers(on: socket)
        setupMessageEventHandlers()
    }

    /// Cycle de vie de la connexion : `.connect`, `.disconnect`, `.reconnect`, `.reconnectAttempt` — un événement
    /// client, une méthode, que les tests pilotent sans transport.
    private func installConnectionHandlers(on socket: SocketIOClient) {
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            self?.handleTransportConnected()
        }

        socket.on(clientEvent: .disconnect) { [weak self, weak socket] data, _ in
            guard let self else { return }
            // Seul le socket COURANT réarme : un ancien, remplacé, n'a plus rien à rouvrir.
            let retries = SocketDisconnectPolicy.retries(afterReason: SocketDisconnectPolicy.reason(in: data))
                && socket != nil && socket === self.socket
            self.handleTransportDisconnected(retries: retries)
        }

        // Une perte de transport n'émet PAS `.disconnect` quand la reconnexion automatique est active :
        // Socket.IO émet `.reconnect` (`SocketManager.tryReconnect`). Sans ce récepteur, `isConnected`
        // restait vrai pendant toute la coupure — chaque envoi attendait son accusé avant le repli REST,
        // et le retour du réseau ne relançait rien.
        socket.on(clientEvent: .reconnect) { [weak self] _, _ in
            self?.handleTransportLost()
        }

        socket.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            self?.handleReconnectAttempt()
        }
    }

    func handleTransportConnected() {
        let wasReconnect = handleConnectionEstablished()

        Task { @MainActor in
            self.isConnected = true
            self.connectionState = .connected
        }

        startHeartbeat()

        // CALL-FIX 2026-06-06 — replay the app foreground/background state on
        // every (re)connect so the gateway always knows whether to deliver
        // incoming calls via the in-app socket banner (foreground) or a VoIP
        // push / CallKit (background). The first connect fires before the app's
        // scenePhase emit lands, so without this replay the gateway would treat
        // a foreground app as unknown and push CallKit for the first call.
        socket?.emit("presence:app-state", ["foreground": lastAppForeground])

        // CALL-FIX 2026-06-06 — ask the gateway to replay any in-progress
        // (ringing) call so a user who comes online / opens the app mid-ring
        // sees the incoming banner immediately, instead of missing the call
        // that started while they were offline/backgrounded.
        socket?.emit("call:check-active")

        // Re-join all tracked conversations (active-first for fastest UX).
        for convId in roomsToRejoinOnConnect() {
            socket?.emit("conversation:join", ["conversationId": convId])
        }

        // Replay user-triggered translation requests that arrived during
        // the disconnect window. The gateway will route them to whichever
        // conversation rooms we just re-joined.
        flushBufferedTranslationRequests()

        if wasReconnect {
            Logger.socket.info("MessageSocket reconnected — re-joined \(self.joinedConversations.count) room(s)")
        } else {
            Logger.socket.info("MessageSocket connected")
        }
    }

    func handleTransportDisconnected(retries: Bool) {
        stopHeartbeat()
        Task { @MainActor in
            self.isConnected = false
            if self.hadPreviousConnection {
                self.connectionState = .reconnecting(attempt: 0)
            } else {
                self.connectionState = .disconnected
            }
            // Coupure prononcée par la passerelle, sur le socket COURANT :
            // Socket.IO ne la rattrape pas (`SocketDisconnectPolicy`).
            if retries {
                self.scheduleReconnectWithBackoff()
            }
        }
        Logger.socket.info("MessageSocket disconnected")
    }

    func handleTransportLost() {
        stopHeartbeat()
        Task { @MainActor in
            self.isConnected = false
            self.connectionState = .reconnecting(attempt: 0)
        }
        Logger.socket.info("MessageSocket transport lost — reconnecting")
    }

    func handleReconnectAttempt() {
        reconnectAttempt += 1
        let attempt = reconnectAttempt
        Task { @MainActor in
            self.connectionState = .reconnecting(attempt: attempt)
        }
        Logger.socket.info("MessageSocket reconnect attempt \(attempt)")
    }

    public func connectAnonymous(sessionToken: String) {
        if let socket, socket.status == .connected || socket.status == .connecting {
            return
        }
        // Transport seul, pas `disconnect()` : au retour d'arrière-plan l'invité garde sa conversation
        // ouverte, et ses salons doivent être rejoints au `.connect` — une remise à froid les oubliait.
        // Un changement de compte passe par `disconnect()` de son côté.
        suspendTransport()

        guard let url = SocketConfig.baseURL else { return }

        Task { @MainActor in self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .handleQueue(.main),
            // CALL-FIX 2026-06-06 — WebSocket transport (voir connect()).
            .extraHeaders(["X-Session-Token": sessionToken]),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
            // BW-IOS-01 — `permessage-deflate` (voir `connect()`).
            .compress,
        ])

        socket = manager?.defaultSocket
        handshakeToken = nil
        setupEventHandlers()
        socket?.connect()
    }

    /// Transport-only teardown shared by `disconnect()`, `prepareForBackground()`
    /// and `forceReconnect()`. Tears down the live socket + heartbeat (so a stale
    /// `isConnected` flag can never suppress the next reconnect) but DELIBERATELY
    /// preserves the session-level state — `hadPreviousConnection` (so the next
    /// `.connect` reports `wasReconnect == true` and fires `didReconnect`, the
    /// sole trigger for the open conversation's missed-message backfill +
    /// queued-receipt flush) AND `joinedConversations` / `activeConversationId`
    /// (so the `.connect` re-join loop restores the rooms active-first, and
    /// `leaveConversation` / typing accounting stays accurate after resume).
    /// Contrast `disconnect()`, the logout/cold reset, which additionally clears
    /// all of that so the next login is a genuine cold connect with no rooms.
    private func suspendTransport() {
        reconnectTask?.cancel()
        reconnectTask = nil
        stopHeartbeat()
        socket?.disconnect()
        transportRetirement.retire(manager)
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
    }

    public func disconnect() {
        suspendTransport()
        // Logout / cold reset: forget the prior connection AND the joined rooms
        // so the next `.connect` is a cold first connect (no spurious backfill,
        // no stale room re-joins under a different account).
        joinedConversations.removeAll()
        activeConversationId = nil
        openConversationIds = []
        hadPreviousConnection = false
    }

    // MARK: - Background lifecycle

    /// Called when the app transitions to `.background`. We stop the
    /// heartbeat timer so it cannot fire into an OS-frozen runtime and we
    /// explicitly tear down the socket so `isConnected` cannot lie to the
    /// resume path. iOS suspension silently kills the WebSocket without
    /// always firing the `disconnect` event — if we trusted
    /// `isConnected == true` on resume, the guard
    /// `if !isConnected { connect() }` would never reconnect and the app
    /// would appear authenticated but receive zero real-time events.
    public func prepareForBackground() {
        // Transport-only teardown: drop the socket so a stale `isConnected`
        // cannot fool the resume path, but KEEP `hadPreviousConnection` so the
        // foreground-resume `.connect` fires `didReconnect` (missed-message
        // backfill + queued read/received-receipt flush).
        suspendTransport()
    }

    /// Called when the app comes back to `.active`. Since
    /// `prepareForBackground()` explicitly tore the socket down, this is
    /// just a plain reconnect — no stale-state decision to make.
    /// Reads the token from `APIClient` (nonisolated mirror of
    /// `AuthManager.authToken`) to keep this hook callable from any context.
    public func resumeFromBackground() {
        guard APIClient.shared.authToken != nil else { return }
        forceReconnect()
    }

    /// CALL-FIX 2026-06-05 — app-injected predicate: "is a call active right now?".
    /// Kept as an opaque closure so the SDK stays call-agnostic (SDK purity rule).
    /// The app wires it to `CallManager.isCallActiveFlag` (a thread-safe nonisolated
    /// flag) at boot. When it returns true, `forceReconnect()` is suppressed so a
    /// token rotation / re-auth never tears down the socket carrying live WebRTC
    /// signaling, which would strand the call on "connecting".
    public var isCallActiveGuard: (@Sendable () -> Bool)?

    /// Whether a backoff retry is currently armed. Test seam: the recovery this
    /// class owes after a rebuild that produced no transport is invisible from
    /// the outside otherwise (no socket, no published state change).
    var hasPendingReconnect: Bool { reconnectTask != nil }

    /// Tear down and rebuild the socket unconditionally. Use this on
    /// foreground resume or after a token refresh so we never depend on
    /// the potentially stale `isConnected` flag. `disconnect()` clears
    /// the flag and nils the underlying socket; `connect()` rebuilds it.
    public func forceReconnect() {
        if isCallActiveGuard?() == true {
            Logger.socket.info("MessageSocket: forceReconnect suppressed — call active (keep signaling socket)")
            // Suppressed, not abandoned. Keeping a HEALTHY signaling socket is the
            // whole point, so nothing to do while it is up — but if it is already
            // down, suppression would otherwise be terminal for the one socket the
            // call depends on. Arm the ladder so the rebuild happens anyway.
            if !isConnected { scheduleReconnectWithBackoff() }
            return
        }
        // Suspend (not full disconnect) so `hadPreviousConnection` survives: this
        // rebuild is a reconnect (resume / network-back / re-auth), and the next
        // `.connect` must fire `didReconnect`.
        suspendTransport()
        if establishTransport() == .notArmed {
            // The teardown above is unconditional but the rebuild is not: no
            // transport was built (missing/expired token, no base URL) and
            // Socket.IO's own retry loop went down with the old socket. The
            // backoff ladder is now the ONLY thing that can bring us back —
            // notably when the post-outage token refresh fails transiently and
            // `handleUnauthorized()` gives up without telling anyone.
            scheduleReconnectWithBackoff()
        }
    }

    /// Connection-handshake bookkeeping, extracted from the `.connect` handler
    /// so the reconnect-vs-cold decision is unit-testable without driving a live
    /// socket. Records that we have now connected, resets the retry counter,
    /// and — when this connection follows a previous one (network blip,
    /// foreground resume, re-auth) — fires `didReconnect` so the app backfills
    /// the open conversation and flushes queued read/received receipts. Returns
    /// whether it was a reconnect for the caller's logging/re-join branch.
    @discardableResult
    func handleConnectionEstablished() -> Bool {
        reconnectTask?.cancel()
        reconnectTask = nil
        let wasReconnect = hadPreviousConnection
        hadPreviousConnection = true
        reconnectAttempt = 0
        backoff.reset()
        if wasReconnect {
            Task { @MainActor [weak self] in self?.didReconnect.send(()) }
        }
        return wasReconnect
    }

    /// The conversation rooms to (re)join on connect, active-first for fastest
    /// UX. Extracted from the `.connect` handler so the re-join set — preserved
    /// across a background suspend (`suspendTransport`) and only cleared on
    /// logout (`disconnect`) — is unit-testable without a live socket.
    func roomsToRejoinOnConnect() -> [String] {
        SocketConnectionRules.roomsToRejoin(joined: joinedConversations, active: activeConversationId, open: openConversationIds)
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeat.start { [weak self] clientTimeMs in
            self?.safeEmit("heartbeat", ["clientTime": clientTimeMs])
        }
    }

    private func stopHeartbeat() {
        heartbeat.stop()
    }

    // MARK: - Room Management

    public func joinConversation(_ conversationId: String) {
        // **Le mémo alimente le RE-JOIN de reconnexion ; il ne décide pas s'il
        // faut poser la question** (#5947). Un `guard !joinedConversations
        // .contains(...) else { return }` vivait ici : rouvrir une conversation
        // dans la même session de socket n'interrogeait donc plus jamais le
        // serveur — le cycle « quitter / revenir » signalé par le porteur.
        //
        // Or la question n'a d'intérêt que par sa RÉPONSE : `conversation:join`
        // est le seul aller-retour qui rende `join-error` / `not_a_member`,
        // c'est-à-dire le seul moyen d'apprendre qu'une appartenance a cessé.
        // Le sauter au motif qu'on a déjà rejoint, c'est raisonner sur un état
        // que seul le serveur connaît.
        //
        // Ce que ça coûte, mesuré : `socket.join` est idempotent côté
        // passerelle, et le budget est de 30 jonctions/minute — une ouverture de
        // conversation est un geste humain. La rafale de reconnexion, elle,
        // n'emprunte pas ce chemin (le handler `.connect` émet directement).
        //
        // Tracker la room AVANT toute emission : le handler `.connect`
        // (re-join loop) re-emet `conversation:join` pour toutes les rooms
        // de `joinedConversations` une fois le handshake termine.
        joinedConversations.insert(conversationId)
        guard socket?.status == .connected else {
            // Socket pas encore connecte : emettre ici serait perdu et
            // declencherait l'erreur `Tried emitting when not connected`.
            // Le re-join du handler `.connect` prendra le relais.
            return
        }
        socket?.emit("conversation:join", ["conversationId": conversationId])
    }

    public func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }
        safeEmit("conversation:leave", ["conversationId": conversationId])
        joinedConversations.remove(conversationId)
    }

    /// Emits only when the socket is actually `.connected`. Fire-and-forget
    /// events (typing, heartbeat, leave) that race a background transition would
    /// otherwise hit "Tried emitting when not connected" as the socket suspends —
    /// the emit is lost either way, so drop it quietly. The re-join loop and the
    /// heartbeat timer resume these on reconnect. NOT for user-critical or
    /// ACK-bearing emits (call signaling / translation buffer via their own paths).
    private func safeEmit(_ event: String, _ payload: [String: Any]) {
        guard socket?.status == .connected else {
            Logger.socket.debug("Skipping \(event, privacy: .public) emit — socket not connected")
            return
        }
        socket?.emit(event, payload)
    }

    // MARK: - Typing Emission

    public func emitTypingStart(conversationId: String) {
        safeEmit("typing:start", ["conversationId": conversationId])
    }

    public func emitTypingStop(conversationId: String) {
        safeEmit("typing:stop", ["conversationId": conversationId])
    }

    // MARK: - Attachment Reactions (BUG2 A')

    /// Pose une réaction sur une pièce jointe (emit direct ; parité offline-queue
    /// différée, cf. spec). Le serveur diffuse `attachment:reaction-added`.
    public func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-add", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }

    public func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-remove", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }

    // MARK: - Translation Request

    static let translationBufferMaxSize = TranslationRequestBuffer.maxSize
    static let translationBufferTTL: TimeInterval = TranslationRequestBuffer.timeToLive

    public func requestTranslation(messageId: String, targetLanguage: String) {
        // U4 — ALWAYS buffer, in addition to emitting when connected. The
        // gateway's `message:translation` completion broadcast is fire-and-forget
        // with no ack/replay, so if the socket drops between this request and the
        // broadcast (a multi-second Whisper/NLLB window), the result is dropped
        // and reconnect never re-asks (syncMissedMessages only re-fetches NEWER
        // messages; flushBufferedTranslationRequests previously replayed only the
        // disconnected buffer). Buffering unconditionally lets the reconnect
        // replay re-ask; the gateway request is idempotent (returns the cached
        // translation) so a redundant replay is harmless, and TTL(60s)+dedup+cap
        // bound the buffer.
        translationBuffer.enqueue(
            PendingTranslationRequest(
                messageId: messageId,
                targetLanguage: targetLanguage,
                queuedAt: Date()
            )
        )
        if isConnected {
            socket?.emit("translation:request", ["messageId": messageId, "targetLanguage": targetLanguage])
            Logger.socket.info("Requested translation for \(messageId) -> \(targetLanguage)")
        }
    }

    /// Flush queued translation requests that are still fresh enough to
    /// matter. Called from the `.connect` handler immediately after
    /// re-joining rooms so the gateway sees a coherent stream
    /// (`conversation:join` first, then late translation asks for those
    /// rooms). Exposed as `internal` so the test bundle can validate the
    /// replay without driving a real socket.
    func flushBufferedTranslationRequests(now: Date = Date()) {
        for request in translationBuffer.drainFresh(now: now) {
            socket?.emit("translation:request", [
                "messageId": request.messageId,
                "targetLanguage": request.targetLanguage
            ])
        }
    }

    #if DEBUG
    var debug_pendingTranslationRequests: [PendingTranslationRequest] {
        translationBuffer.pending
    }
    #endif

    // MARK: - Location Emission

    /// Emits `payload` as a Socket.IO dictionary.
    ///
    /// A failed conversion used to abort the emission silently: the user shared
    /// a location and nothing ever left the device, with no error anywhere.
    private func emitEncodable<P: Encodable>(_ payload: P, event: String) {
        do {
            let data = try JSONEncoder().encode(payload)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                Logger.socket.error("\(event, privacy: .public) not emitted — payload is not a JSON object")
                return
            }
            socket?.emit(event, dict)
        } catch {
            Logger.socket.error("\(event, privacy: .public) not emitted — payload encode failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func emitLiveLocationStart(payload: LiveLocationStartPayload) {
        emitEncodable(payload, event: "location:live-start")
    }

    public func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload) {
        emitEncodable(payload, event: "location:live-update")
    }

    public func emitLiveLocationStop(conversationId: String) {
        socket?.emit("location:live-stop", ["conversationId": conversationId])
    }

    /// Reports whether the app is in the FOREGROUND so the gateway can decide,
    /// per incoming call, between socket delivery (in-app banner) and a VoIP push
    /// (CallKit). A backgrounded iOS app keeps a live socket for ~45s but is
    /// suspended and can't ring from a socket event — without this signal the
    /// gateway thought it was reachable and never sent the VoIP push, so calls
    /// never rang when the app wasn't foreground. Emit on scenePhase transitions
    /// (and on connect) while the socket is still alive (`.inactive` fires before
    /// suspension).
    /// Last app foreground/background state declared by the app, replayed on every
    /// (re)connect (see the `.connect` handler). Defaults to `true` because the
    /// socket only ever connects while the app is foreground (iOS suspends it in
    /// background), so a fresh connection is foreground by definition.
    private var lastAppForeground = true

    public func emitAppForeground(_ foreground: Bool) {
        lastAppForeground = foreground
        socket?.emit("presence:app-state", ["foreground": foreground])
    }

    // MARK: - Friend request lifecycle

    /// `friend-request:cancelled` ne porte que `{friendRequestId, cancelledBy}`
    /// et ne dit PAS de quel cote se trouve le lecteur — l'evenement part a
    /// l'user-room de l'AUTRE partie, donc `cancelledBy` est l'interlocuteur,
    /// que la demande ait ete emise ou recue. On retire dans les DEUX sens :
    /// chacune des deux methodes est un no-op quand la cle est absente.
    ///
    /// Muter `FriendshipCache` ne repeint PAS l'ecran Demandes : ses lignes
    /// viennent de GRDB (`PersistenceKeys.receivedRequests` / `sentRequests`),
    /// qui resterait `.fresh` avec la ligne retiree. D'ou l'invalidation
    /// EXPLICITE — `notifyChange()` ne fait qu'incrementer `version`.
    static func applyFriendRequestWithdrawal(otherUserId: String) async {
        FriendshipCache.shared.didCancelRequest(to: otherUserId)
        FriendshipCache.shared.didRejectRequest(from: otherUserId)
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
    }

    /// `friend-request:rejected` arrive chez l'EXPEDITEUR d'origine : sa demande
    /// vit dans `_sentPending`, que `didCancelRequest(to:)` vide.
    /// `didRejectRequest(from:)` viderait `_receivedPending` — mauvaise
    /// direction, no-op garanti.
    static func applyFriendRequestRejection(rejecterId: String) async {
        FriendshipCache.shared.didCancelRequest(to: rejecterId)
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
    }

    // MARK: - Decode Helper

    nonisolated func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @MainActor @Sendable (T) -> Void) {
        SocketPayloadDecoder.decode(type, from: data, handler: handler)
    }
}
