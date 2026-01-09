//
//  WebSocketService.swift
//  Meeshy
//
//  WebSocket service for real-time messaging using Socket.IO
//  Handles connection, authentication, event queue, and reconnection
//  Minimum iOS 16+
//  Swift 6 compliant with MainActor isolation
//

import Foundation
@preconcurrency import SocketIO

// MARK: - WebSocket Event

struct WebSocketEvent: @unchecked Sendable {
    let type: String
    let data: Any
}

// MARK: - Sendable Wrappers

private struct UncheckedSendableAny: @unchecked Sendable {
    let value: Any
}

private struct UncheckedSendableDict: @unchecked Sendable {
    let value: [String: Any]
}

// MARK: - Event Priority

enum WebSocketEventPriority: Int, Sendable {
    case high = 0      // Messages, reactions
    case normal = 1    // Read receipts
    case low = 2       // Typing indicators (can be dropped)
}

// MARK: - Queued Event

private struct QueuedEvent: @unchecked Sendable {
    let event: String
    let data: [String: Any]
    let timestamp: Date
    let priority: WebSocketEventPriority
}

// MARK: - WebSocket Service

@MainActor
final class WebSocketService: ObservableObject {
    // MARK: - Singleton

    static let shared = WebSocketService()

    // MARK: - Published Properties

    @Published private(set) var isConnected = false
    @Published private(set) var isAuthenticated = false
    @Published private(set) var connectionStatus: ConnectionStatus = .disconnected

    // MARK: - Private Properties

    private var manager: SocketIO.SocketManager?
    private var socketClient: SocketIO.SocketIOClient?
    private var eventHandlers: [String: [@Sendable (Any) -> Void]] = [:]

    /// Dynamic base URL from EnvironmentConfig (centralized configuration)
    private var baseURL: String {
        EnvironmentConfig.websocketURL
    }
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 10

    /// Event queue for when socket is disconnected
    private var eventQueue: [QueuedEvent] = []
    private let maxQueueSize = 100
    private let queueEventTTL: TimeInterval = 300 // 5 minutes

    /// Whether user intentionally disconnected (don't warn on emit failures)
    private var isIntentionalDisconnect = false

    /// Authentication continuation for waiting on auth response
    private var authContinuation: CheckedContinuation<Bool, Never>?

    enum ConnectionStatus: String, Sendable {
        case disconnected = "Disconnected"
        case connecting = "Connecting..."
        case authenticating = "Authenticating..."
        case connected = "Connected"
        case reconnecting = "Reconnecting..."
        case failed = "Connection Failed"
    }

    // MARK: - Initialization

    private init() {
        // Don't create socket here - it will be created in connect() with auth token
        // baseURL is now a computed property using EnvironmentConfig.websocketURL
        wsLogger.info("[WebSocket] Service initialized, waiting for connect()")
    }

    // MARK: - Setup

    /// Setup socket with authentication token included in connection
    /// For Socket.IO v3/v4: Auth is sent via socket.connect(withPayload:) for namespace auth
    /// Headers are used for Engine.IO level (HTTP upgrade)
    private func setupSocketWithAuth(token: String) {
        wsLogger.info("[WebSocket] setupSocketWithAuth() called")
        wsLogger.info("[WebSocket] Base URL: \(baseURL)")

        guard let url = URL(string: baseURL) else {
            wsLogger.error("[WebSocket] Invalid URL: \(baseURL)")
            return
        }

        wsLogger.info("[WebSocket] URL valid: \(url)")

        // Socket.IO v3/v4 configuration (Server uses Socket.IO v4.8.1)
        // Auth is sent via:
        // 1. extraHeaders Authorization (for Engine.IO HTTP upgrade)
        // 2. connect(withPayload:) for handshake.auth (Socket.IO v3+ namespace auth)
        //
        // PERFORMANCE: forceWebsockets + forceNew + connectParams for fastest connection
        // Avoids long-polling fallback that causes 10-14s delays

        var config: SocketIO.SocketIOClientConfiguration = [
            .log(false),  // Disable verbose logging in production for better perf
            .path("/socket.io/"),
            .compress,
            .reconnects(true),
            .reconnectAttempts(maxReconnectAttempts),
            .reconnectWait(1),        // Start reconnect attempt sooner (1s instead of 2s)
            .reconnectWaitMax(15),    // Cap max wait at 15s instead of 30s
            .randomizationFactor(0.3), // Less randomization for more predictable reconnects
            .forceWebsockets(true),   // Skip long-polling, go straight to WebSocket
            .forceNew(true),          // Create fresh connection (avoid stale socket reuse)
            .secure(true),
            .version(.three),         // Server uses Socket.IO v4.8.1 (compatible with v3 protocol)
            .connectParams(["token": token]),  // Send token in query params for faster auth
            .extraHeaders([
                "Authorization": "Bearer \(token)",
                "User-Agent": "Meeshy-iOS/1.0"
            ])
        ]

        wsLogger.info("[WebSocket] Config: version=v3, path=/socket.io/, secure=true, forceWebsockets=true")

        manager = SocketIO.SocketManager(socketURL: url, config: config)
        socketClient = manager?.defaultSocket

        wsLogger.info("[WebSocket] SocketManager created: \(manager != nil)")
        wsLogger.info("[WebSocket] SocketClient created: \(socketClient != nil)")

        // Setup event handlers synchronously BEFORE connecting
        setupEventHandlersSync()

        wsLogger.info("[WebSocket] Socket configured with auth token and handlers")
    }


    // MARK: - Connection Management

    func connect() async {
        wsLogger.info("[WebSocket] connect() called")

        // Prevent multiple connection attempts
        if isConnected {
            wsLogger.info("[WebSocket] Already connected, skipping")
            return
        }

        if connectionStatus == .connecting || connectionStatus == .authenticating {
            wsLogger.info("[WebSocket] Already connecting, skipping")
            return
        }

        // Reset intentional disconnect flag
        isIntentionalDisconnect = false

        // Get access token
        guard let accessToken = await KeychainService.shared.getAccessToken() else {
            wsLogger.error("[WebSocket] No access token available in KeychainService")
            connectionStatus = .failed
            return
        }

        wsLogger.info("[WebSocket] Got access token: \(accessToken.prefix(20))...")

        // Disconnect existing socket if any
        if socketClient != nil {
            wsLogger.info("[WebSocket] Disconnecting existing socket before reconnect...")
            socketClient?.disconnect()
            socketClient = nil
            manager = nil
        }

        // Configure socket with auth token
        setupSocketWithAuth(token: accessToken)

        guard let socket = socketClient else {
            wsLogger.error("[WebSocket] Socket not initialized after setupSocketWithAuth")
            return
        }

        connectionStatus = .connecting
        wsLogger.info("[WebSocket] Connecting to \(baseURL)...")

        // Socket.IO v3/v4: Pass auth payload via connect(withPayload:)
        // This populates socket.handshake.auth on the server side
        let authPayload: [String: Any] = ["token": accessToken]

        wsLogger.info("[WebSocket] Calling socket.connect(withPayload:) with auth token")
        socket.connect(withPayload: authPayload)
        wsLogger.info("[WebSocket] socket.connect(withPayload:) called")

        // Store token for reconnection
        currentAuthToken = accessToken
    }

    /// Current auth token for reconnection
    private var currentAuthToken: String?

    func disconnect() {
        isIntentionalDisconnect = true
        socketClient?.disconnect()
        isConnected = false
        isAuthenticated = false
        connectionStatus = .disconnected
        reconnectAttempts = 0
        currentAuthToken = nil

        // Clear low-priority queued events on intentional disconnect
        eventQueue.removeAll { $0.priority == .low }

        wsLogger.info("[WebSocket] Disconnected intentionally")
    }

    /// Wait for authentication response from server
    /// The token is already sent with the connection (in headers + connectParams)
    /// Server will respond with 'authenticated' or 'unauthorized' event
    private func waitForAuthentication() async -> Bool {
        connectionStatus = .authenticating
        wsLogger.info("[WebSocket] Waiting for server authentication response...")

        return await withCheckedContinuation { continuation in
            self.authContinuation = continuation

            // Timeout after 5 seconds (reduced from 10s for faster startup)
            Task {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if let cont = self.authContinuation {
                    self.authContinuation = nil
                    wsLogger.warn("[WebSocket] Authentication timeout - assuming success (token in headers)")
                    await MainActor.run {
                        self.isAuthenticated = true
                        self.connectionStatus = .connected
                    }
                    cont.resume(returning: true)
                }
            }
        }
    }

    // MARK: - Event Handlers

    /// Setup event handlers synchronously (must be called before connect)
    private func setupEventHandlersSync() {
        guard let socket = socketClient else {
            wsLogger.error("[WebSocket] Cannot setup handlers - socket is nil")
            return
        }

        wsLogger.info("[WebSocket] Setting up event handlers...")

        // MARK: Debug Handler - Log ALL events and detect connection
        socket.onAny { [weak self] event in
            wsLogger.debug("[WebSocket] ANY EVENT: '\(event.event)' with data: \(event.items ?? [])")

            // FALLBACK: If we receive any server event but isConnected is false,
            // it means the 'connect' event was missed - fix the state
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                // Skip internal events
                let internalEvents = ["ping", "pong", "connect", "disconnect", "error", "connect_error", "authenticated", "unauthorized"]
                if !internalEvents.contains(event.event) && !self.isConnected {
                    wsLogger.warn("[WebSocket] ⚠️ Received '\(event.event)' but isConnected=false! Fixing state...")
                    self.isConnected = true
                }

                // If we receive server events but not authenticated, check if we missed 'authenticated'
                if !internalEvents.contains(event.event) && self.isConnected && !self.isAuthenticated {
                    wsLogger.warn("[WebSocket] ⚠️ Received '\(event.event)' but isAuthenticated=false! Server events imply auth success. Fixing state...")
                    self.isAuthenticated = true
                    self.connectionStatus = .connected
                    // Process queue and rejoin rooms
                    await self.processEventQueue()
                    self.rejoinConversations()
                }
            }
        }

        // MARK: Connection Events

        socket.on(clientEvent: .connect) { [weak self] data, _ in
            wsLogger.info("[WebSocket] ✅ CONNECT event received! Data: \(data)")
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                wsLogger.info("[WebSocket] Socket connected at Engine.IO level, setting isConnected = true")
                self.isConnected = true
                self.reconnectAttempts = 0
                self.connectionStatus = .authenticating

                // Don't set isAuthenticated here - wait for server's 'authenticated' event
                // The server will validate the JWT and emit 'authenticated' on success
                wsLogger.info("[WebSocket] Waiting for server 'authenticated' event...")
            }
        }

        // Status change handler for debugging
        socket.on(clientEvent: .statusChange) { data, _ in
            wsLogger.info("[WebSocket] Status changed: \(data)")
        }

        // WebSocket upgrade handler - fires when Engine.IO upgrades to WebSocket
        socket.on(clientEvent: .websocketUpgrade) { data, _ in
            wsLogger.info("[WebSocket] WebSocket upgraded with headers: \(data)")
        }

        // Server-side connection error (Socket.IO level rejection)
        socket.on("connect_error") { data, _ in
            wsLogger.error("[WebSocket] connect_error from server: \(data)")
        }

        wsLogger.info("[WebSocket] Connect handler registered")

        socket.on(clientEvent: .disconnect) { [weak self] data, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                self.isConnected = false
                self.isAuthenticated = false

                if self.isIntentionalDisconnect {
                    wsLogger.info("[WebSocket] Disconnected (intentional)")
                    self.connectionStatus = .disconnected
                } else {
                    let reason = (data.first as? String) ?? "unknown"
                    wsLogger.warn("[WebSocket] Disconnected unexpectedly: \(reason)")
                    self.connectionStatus = .reconnecting
                }
            }
        }

        socket.on(clientEvent: .reconnect) { [weak self] _, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                wsLogger.info("[WebSocket] Reconnected at Engine.IO level")
                self.isConnected = true
                self.reconnectAttempts = 0
                self.connectionStatus = .authenticating
                // Wait for 'authenticated' event from server
                wsLogger.info("[WebSocket] Waiting for server 'authenticated' event after reconnect...")
            }
        }

        socket.on(clientEvent: .reconnectAttempt) { [weak self] data, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.reconnectAttempts += 1
                self.connectionStatus = .reconnecting
                wsLogger.info("[WebSocket] Reconnection attempt \(self.reconnectAttempts)/\(self.maxReconnectAttempts)")
                // For v2: reconnection is handled automatically with connectParams
            }
        }

        socket.on(clientEvent: .error) { data, _ in
            let errorDesc = (data.first as? String) ?? "Unknown error"
            wsLogger.error("[WebSocket] Error: \(errorDesc)")
        }

        // MARK: Authentication Response

        socket.on("authenticated") { [weak self] data, _ in
            wsLogger.info("[WebSocket] ✅ AUTHENTICATED event received from server! Data: \(data)")
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                wsLogger.info("[WebSocket] ✅ Authentication successful - setting isAuthenticated = true")
                self.isAuthenticated = true
                self.connectionStatus = .connected

                // Resume any waiting continuation
                if let continuation = self.authContinuation {
                    self.authContinuation = nil
                    continuation.resume(returning: true)
                }

                // Process queued events after successful authentication
                wsLogger.info("[WebSocket] Processing queued events...")
                await self.processEventQueue()

                // Rejoin conversation rooms
                wsLogger.info("[WebSocket] Rejoining conversation rooms...")
                self.rejoinConversations()

                wsLogger.info("[WebSocket] ✅ Fully connected and ready!")
            }
        }

        socket.on("unauthorized") { [weak self] data, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                let reason = (data.first as? [String: Any])?["message"] as? String ?? "Unknown"
                wsLogger.error("[WebSocket] Authentication failed: \(reason)")
                self.isAuthenticated = false
                self.connectionStatus = .failed

                // Resume any waiting continuation
                if let continuation = self.authContinuation {
                    self.authContinuation = nil
                    continuation.resume(returning: false)
                }
            }
        }

        // MARK: Message Events (Server → Client)

        socket.on(EnvironmentConfig.SocketEvent.messageNew) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.messageNew, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.messageEdited) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.messageEdited, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.messageDeleted) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.messageDeleted, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.messageTranslation) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.messageTranslation, data: data)
        }

        // Legacy/compat events
        socket.on(EnvironmentConfig.SocketEvent.messageSent) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.messageSent, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.messageRead) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.messageRead, data: data)
        }

        // MARK: Typing Events (Server → Client)

        socket.on(EnvironmentConfig.SocketEvent.typingStarted) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.typingStarted, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.typingStopped) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.typingStopped, data: data)
        }

        // MARK: User Presence Events

        socket.on(EnvironmentConfig.SocketEvent.userOnline) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.userOnline, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.userOffline) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.userOffline, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.userPresence) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.userPresence, data: data)
        }

        // MARK: Reaction Events (Server → Client)

        socket.on(EnvironmentConfig.SocketEvent.reactionAdded) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.reactionAdded, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.reactionRemoved) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.reactionRemoved, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.reactionSync) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.reactionSync, data: data)
        }

        // MARK: Conversation Events

        socket.on(EnvironmentConfig.SocketEvent.conversationUpdated) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.conversationUpdated, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.conversationDeleted) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.conversationDeleted, data: data)
        }

        // MARK: Call Events (Server -> Client) - Matching gateway CallEventsHandler

        // call:initiated - Call was created (for initiator confirmation and incoming call notification)
        socket.on(EnvironmentConfig.SocketEvent.callInitiated) { [weak self] data, _ in
            wsLogger.info("[WebSocket] Received call:initiated event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callInitiated, data: data)
        }

        // call:participant-joined - Someone joined the call
        socket.on(EnvironmentConfig.SocketEvent.callParticipantJoined) { [weak self] data, _ in
            wsLogger.info("[WebSocket] Received call:participant-joined event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callParticipantJoined, data: data)
        }

        // call:participant-left - Someone left the call
        socket.on(EnvironmentConfig.SocketEvent.callParticipantLeft) { [weak self] data, _ in
            wsLogger.info("[WebSocket] Received call:participant-left event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callParticipantLeft, data: data)
        }

        // call:signal - WebRTC signaling (offer, answer, ICE candidates)
        socket.on(EnvironmentConfig.SocketEvent.callSignal) { [weak self] data, _ in
            wsLogger.debug("[WebSocket] Received call:signal event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callSignal, data: data)
        }

        // call:media-toggled - Audio/video state changed
        socket.on(EnvironmentConfig.SocketEvent.callMediaToggled) { [weak self] data, _ in
            wsLogger.debug("[WebSocket] Received call:media-toggled event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callMediaToggled, data: data)
        }

        // call:ended - Call ended
        socket.on(EnvironmentConfig.SocketEvent.callEnded) { [weak self] data, _ in
            wsLogger.info("[WebSocket] Received call:ended event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callEnded, data: data)
        }

        // call:error - Call error occurred
        socket.on(EnvironmentConfig.SocketEvent.callError) { [weak self] data, _ in
            wsLogger.error("[WebSocket] Received call:error event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callError, data: data)
        }

        // call:join - Response when we join a call
        socket.on(EnvironmentConfig.SocketEvent.callJoin) { [weak self] data, _ in
            wsLogger.info("[WebSocket] Received call:join response")
            self?.handleEvent(EnvironmentConfig.SocketEvent.callJoin, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.callAccepted) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.callAccepted, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.callRejected) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.callRejected, data: data)
        }

        // MARK: Notification Events

        socket.on(EnvironmentConfig.SocketEvent.notificationNew) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.notificationNew, data: data)
        }

        socket.on(EnvironmentConfig.SocketEvent.notificationRead) { [weak self] data, _ in
            self?.handleEvent(EnvironmentConfig.SocketEvent.notificationRead, data: data)
        }

        // MARK: Read Status Events (Server -> Client)

        socket.on(EnvironmentConfig.SocketEvent.readStatusUpdated) { [weak self] data, _ in
            wsLogger.debug("[WebSocket] Received read-status:updated event")
            self?.handleEvent(EnvironmentConfig.SocketEvent.readStatusUpdated, data: data)
        }

        wsLogger.info("[WebSocket] All event handlers registered")
    }

    // MARK: - Event Subscription

    /// Subscriber-based event handler storage
    /// Key: event name, Value: Dictionary of [subscriberId: handler]
    private var subscriberHandlers: [String: [String: @Sendable (Any) -> Void]] = [:]

    /// Subscribe to an event with a unique subscriber ID
    /// If the same subscriberId registers again for the same event, it replaces the previous handler
    /// - Parameters:
    ///   - event: The event name to listen for
    ///   - subscriberId: Unique identifier for the subscriber (e.g., "ModernChatViewModel_\(conversationId)")
    ///   - handler: The handler to call when the event is received
    func on(_ event: String, subscriberId: String, handler: @escaping @Sendable (Any) -> Void) {
        if subscriberHandlers[event] == nil {
            subscriberHandlers[event] = [:]
        }
        subscriberHandlers[event]?[subscriberId] = handler
        wsLogger.debug("[WebSocket] Subscribed '\(subscriberId)' to '\(event)'")
    }

    /// Legacy on() without subscriber ID - appends handlers (deprecated, prefer on(_:subscriberId:handler:))
    func on(_ event: String, handler: @escaping @Sendable (Any) -> Void) {
        if eventHandlers[event] == nil {
            eventHandlers[event] = []
        }
        eventHandlers[event]?.append(handler)
    }

    /// Unsubscribe a specific subscriber from an event
    func off(_ event: String, subscriberId: String) {
        subscriberHandlers[event]?.removeValue(forKey: subscriberId)
        wsLogger.debug("[WebSocket] Unsubscribed '\(subscriberId)' from '\(event)'")
    }

    /// Unsubscribe all handlers for an event (legacy)
    func off(_ event: String) {
        eventHandlers.removeValue(forKey: event)
        subscriberHandlers.removeValue(forKey: event)
    }

    /// Unsubscribe a subscriber from all events
    func offAll(subscriberId: String) {
        for event in subscriberHandlers.keys {
            subscriberHandlers[event]?.removeValue(forKey: subscriberId)
        }
        wsLogger.debug("[WebSocket] Unsubscribed '\(subscriberId)' from all events")
    }

    // MARK: - Batch Subscription (Performance Optimization)

    /// Convenience struct for chat event handlers
    struct ChatEventHandlers: Sendable {
        var onMessageNew: (@Sendable (Any) -> Void)?
        var onMessageEdited: (@Sendable (Any) -> Void)?
        var onMessageDeleted: (@Sendable (Any) -> Void)?
        var onTypingStart: (@Sendable (Any) -> Void)?
        var onTypingStop: (@Sendable (Any) -> Void)?
        var onUserPresence: (@Sendable (Any) -> Void)?
        var onReactionAdded: (@Sendable (Any) -> Void)?
        var onReactionRemoved: (@Sendable (Any) -> Void)?
        var onReactionSync: (@Sendable (Any) -> Void)?
        var onReadStatusUpdated: (@Sendable (Any) -> Void)?
        var onMessageTranslation: (@Sendable (Any) -> Void)?
    }

    /// Subscribe to all chat events at once using a handler struct
    /// This replaces 11 individual on() calls with a single batch operation
    func subscribeToChatEvents(subscriberId: String, handlers: ChatEventHandlers) {
        if let h = handlers.onMessageNew {
            on(EnvironmentConfig.SocketEvent.messageNew, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onMessageEdited {
            on(EnvironmentConfig.SocketEvent.messageEdited, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onMessageDeleted {
            on(EnvironmentConfig.SocketEvent.messageDeleted, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onTypingStart {
            on(EnvironmentConfig.SocketEvent.typingStart, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onTypingStop {
            on(EnvironmentConfig.SocketEvent.typingStop, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onUserPresence {
            on(EnvironmentConfig.SocketEvent.userPresence, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onReactionAdded {
            on(EnvironmentConfig.SocketEvent.reactionAdded, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onReactionRemoved {
            on(EnvironmentConfig.SocketEvent.reactionRemoved, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onReactionSync {
            on(EnvironmentConfig.SocketEvent.reactionSync, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onReadStatusUpdated {
            on(EnvironmentConfig.SocketEvent.readStatusUpdated, subscriberId: subscriberId, handler: h)
        }
        if let h = handlers.onMessageTranslation {
            on(EnvironmentConfig.SocketEvent.messageTranslation, subscriberId: subscriberId, handler: h)
        }
        wsLogger.debug("[WebSocket] Batch subscribed '\(subscriberId)' to chat events")
    }

    nonisolated private func handleEvent(_ event: String, data: [Any]) {
        let sendableData = data.map { UncheckedSendableAny(value: $0) }
        Task { @MainActor in
            guard let wrapped = sendableData.first else { return }

            // Call subscriber-based handlers (new system - no duplicates)
            if let subHandlers = self.subscriberHandlers[event] {
                for (_, handler) in subHandlers {
                    handler(wrapped.value)
                }
            }

            // Call legacy array-based handlers (deprecated)
            if let handlers = self.eventHandlers[event] {
                for handler in handlers {
                    handler(wrapped.value)
                }
            }
        }
    }

    // MARK: - Event Queue Management

    /// Queue an event for later sending when disconnected
    private func queueEvent(_ event: String, data: [String: Any], priority: WebSocketEventPriority) {
        // Don't queue typing events - they're not useful when delayed
        if priority == .low {
            return
        }

        // Remove expired events
        let now = Date()
        eventQueue.removeAll { now.timeIntervalSince($0.timestamp) > queueEventTTL }

        // Enforce max queue size (remove oldest low-priority first)
        while eventQueue.count >= maxQueueSize {
            if let lowPriorityIndex = eventQueue.lastIndex(where: { $0.priority == .low }) {
                eventQueue.remove(at: lowPriorityIndex)
            } else if let normalPriorityIndex = eventQueue.lastIndex(where: { $0.priority == .normal }) {
                eventQueue.remove(at: normalPriorityIndex)
            } else {
                eventQueue.removeFirst()
            }
        }

        // Add new event
        eventQueue.append(QueuedEvent(
            event: event,
            data: data,
            timestamp: now,
            priority: priority
        ))

        wsLogger.debug("[WebSocket] Event queued: \(event) (queue size: \(eventQueue.count))")
    }

    /// Process all queued events after reconnection
    private func processEventQueue() async {
        guard isConnected && isAuthenticated else { return }
        guard !eventQueue.isEmpty else { return }

        wsLogger.info("[WebSocket] Processing \(eventQueue.count) queued events")

        // Sort by priority (high first) then by timestamp (oldest first)
        let sortedQueue = eventQueue.sorted { lhs, rhs in
            if lhs.priority.rawValue != rhs.priority.rawValue {
                return lhs.priority.rawValue < rhs.priority.rawValue
            }
            return lhs.timestamp < rhs.timestamp
        }

        eventQueue.removeAll()

        for queuedEvent in sortedQueue {
            // Skip expired events
            if Date().timeIntervalSince(queuedEvent.timestamp) > queueEventTTL {
                continue
            }

            socketClient?.emit(queuedEvent.event, queuedEvent.data)
            wsLogger.debug("[WebSocket] Sent queued event: \(queuedEvent.event)")

            // Small delay between events to avoid flooding
            try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }
    }

    // MARK: - Emit Events

    /// Emit an event, queuing if disconnected
    nonisolated func emit(_ event: String, data: [String: Any], priority: WebSocketEventPriority = .normal) {
        let sendableData = UncheckedSendableDict(value: data)
        Task { @MainActor in
            if self.isConnected && self.isAuthenticated {
                self.socketClient?.emit(event, sendableData.value)
                wsLogger.debug("[WebSocket] ✅ Emitted: \(event)")
            } else {
                // Log why we can't emit
                wsLogger.warn("[WebSocket] Cannot emit '\(event)': isConnected=\(self.isConnected), isAuthenticated=\(self.isAuthenticated)")
                // Queue for later if not a typing event
                if !self.isIntentionalDisconnect {
                    self.queueEvent(event, data: sendableData.value, priority: priority)
                }
            }
        }
    }

    /// Emit an event only if connected (no queuing, silent fail)
    nonisolated func emitIfConnected(_ event: String, data: [String: Any]) {
        let sendableData = UncheckedSendableDict(value: data)
        Task { @MainActor in
            guard self.isConnected && self.isAuthenticated else { return }
            self.socketClient?.emit(event, sendableData.value)
        }
    }

    nonisolated func emitWithAck(_ event: String, data: [String: Any], completion: @escaping @Sendable (Any) -> Void) {
        let sendableData = UncheckedSendableDict(value: data)
        Task { @MainActor in
            guard self.isConnected && self.isAuthenticated, let socket = self.socketClient else {
                if !self.isIntentionalDisconnect {
                    wsLogger.debug("[WebSocket] Cannot emit with ack - not connected")
                }
                return
            }

            // MVP: Simplified - emit without ack, call completion immediately
            socket.emit(event, sendableData.value)
            completion([:])
        }
    }

    // MARK: - Async Emit with ACK and Timeout

    /// Result type for socket operations
    struct SocketMessageResult: Sendable {
        let success: Bool
        let messageId: String?
        let error: String?
    }

    /// Emit an event with ACK support and timeout - async version
    /// Returns a result indicating success/failure with optional messageId
    /// Uses Socket.IO's built-in timeout mechanism for ACK
    func emitWithAckAsync(_ event: String, data: [String: Any], timeout: TimeInterval = 10.0) async -> SocketMessageResult {
        guard isConnected && isAuthenticated, let socket = socketClient else {
            wsLogger.warn("[WebSocket] Cannot emit '\(event)' - not connected or authenticated")
            return SocketMessageResult(success: false, messageId: nil, error: "Not connected")
        }

        return await withCheckedContinuation { continuation in
            // Use nonisolated(unsafe) for the flag since we're in a callback context
            // Socket.IO's timingOut handles the timeout, so we only need to track if we've already resumed
            nonisolated(unsafe) var hasResumed = false

            // Emit with ACK callback - Socket.IO handles timeout internally
            socket.emitWithAck(event, data).timingOut(after: timeout) { ackData in
                // Ensure we only resume once
                guard !hasResumed else { return }
                hasResumed = true

                // Parse the ACK response
                // Expected format: { success: bool, data?: { messageId: string }, error?: string }
                if let response = ackData.first as? [String: Any] {
                    let success = response["success"] as? Bool ?? false
                    let messageId = (response["data"] as? [String: Any])?["messageId"] as? String
                    let error = response["error"] as? String

                    if success {
                        wsLogger.info("[WebSocket] ✅ ACK received for \(event), messageId: \(messageId ?? "none")")
                        continuation.resume(returning: SocketMessageResult(success: true, messageId: messageId, error: nil))
                    } else {
                        wsLogger.warn("[WebSocket] ❌ ACK error for \(event): \(error ?? "Unknown error")")
                        continuation.resume(returning: SocketMessageResult(success: false, messageId: nil, error: error ?? "Unknown error"))
                    }
                } else if ackData.isEmpty || (ackData.first as? String) == "NO ACK" {
                    // Timeout case from Socket.IO
                    wsLogger.warn("[WebSocket] ACK timeout (NO ACK) for event: \(event)")
                    continuation.resume(returning: SocketMessageResult(success: false, messageId: nil, error: "Timeout - no acknowledgment"))
                } else {
                    wsLogger.warn("[WebSocket] Unexpected ACK format for \(event): \(ackData)")
                    continuation.resume(returning: SocketMessageResult(success: false, messageId: nil, error: "Invalid response format"))
                }
            }
        }
    }

    // MARK: - Async Message Sending with ACK

    /// Send a message via WebSocket with ACK confirmation (async)
    /// Returns SocketMessageResult indicating success/failure
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - content: The message content (or placeholder if encrypted)
    ///   - originalLanguage: Language code of the message
    ///   - messageType: Type of message (text, image, etc.)
    ///   - replyToId: ID of message being replied to
    ///   - encryptedContent: JSON string of EncryptedPayload for E2E encrypted messages
    func sendMessageAsync(
        conversationId: String,
        content: String,
        originalLanguage: String? = nil,
        messageType: String = "text",
        replyToId: String? = nil,
        encryptedContent: String? = nil
    ) async -> SocketMessageResult {
        var data: [String: Any] = [
            "conversationId": conversationId,
            "content": content,
            "messageType": messageType
        ]
        if let lang = originalLanguage {
            data["originalLanguage"] = lang
        }
        if let replyId = replyToId {
            data["replyToId"] = replyId
        }
        if let encrypted = encryptedContent {
            data["encryptedContent"] = encrypted
        }

        wsLogger.info("[WebSocket] 📤 Sending message via Socket.IO to conversation: \(conversationId), encrypted: \(encryptedContent != nil)")
        return await emitWithAckAsync(EnvironmentConfig.SocketEvent.messageSend, data: data, timeout: 15.0)
    }

    /// Send a message with attachments via WebSocket with ACK confirmation (async)
    /// Returns SocketMessageResult indicating success/failure
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - content: The message content (or placeholder if encrypted)
    ///   - attachmentIds: Array of uploaded attachment IDs
    ///   - originalLanguage: Language code of the message
    ///   - messageType: Type of message (text, image, etc.)
    ///   - replyToId: ID of message being replied to
    ///   - encryptedContent: JSON string of EncryptedPayload for E2E encrypted messages
    func sendMessageWithAttachmentsAsync(
        conversationId: String,
        content: String,
        attachmentIds: [String],
        originalLanguage: String? = nil,
        messageType: String = "text",
        replyToId: String? = nil,
        encryptedContent: String? = nil
    ) async -> SocketMessageResult {
        var data: [String: Any] = [
            "conversationId": conversationId,
            "content": content,
            "attachmentIds": attachmentIds,
            "messageType": messageType
        ]
        if let lang = originalLanguage {
            data["originalLanguage"] = lang
        }
        if let replyId = replyToId {
            data["replyToId"] = replyId
        }
        if let encrypted = encryptedContent {
            data["encryptedContent"] = encrypted
        }

        wsLogger.info("[WebSocket] 📤 Sending message with \(attachmentIds.count) attachment(s) via Socket.IO, encrypted: \(encryptedContent != nil)")
        return await emitWithAckAsync(EnvironmentConfig.SocketEvent.messageSendWithAttachments, data: data, timeout: 15.0)
    }

    // MARK: - Conversation Room Management

    /// Set of conversation IDs the user is currently subscribed to
    private var joinedConversations: Set<String> = []

    /// Join multiple conversation rooms to receive real-time updates
    /// Should be called after authentication with all user's conversation IDs
    func joinConversations(_ conversationIds: [String]) {
        guard !conversationIds.isEmpty else { return }

        // Filter out already joined conversations
        let newConversations = conversationIds.filter { !joinedConversations.contains($0) }
        guard !newConversations.isEmpty else {
            wsLogger.debug("[WebSocket] All conversations already joined")
            return
        }

        wsLogger.info("[WebSocket] Joining \(newConversations.count) conversation rooms")

        emit(EnvironmentConfig.SocketEvent.conversationJoinMultiple, data: [
            "conversationIds": newConversations
        ], priority: .high)

        // Track as joined (optimistic)
        for id in newConversations {
            joinedConversations.insert(id)
        }
    }

    /// Join a single conversation room
    func joinConversation(_ conversationId: String) {
        guard !joinedConversations.contains(conversationId) else {
            wsLogger.debug("[WebSocket] Already in conversation room: \(conversationId)")
            return
        }

        wsLogger.info("[WebSocket] Joining conversation room: \(conversationId)")

        emit(EnvironmentConfig.SocketEvent.conversationJoin, data: [
            "conversationId": conversationId
        ], priority: .high)

        joinedConversations.insert(conversationId)
    }

    /// Leave a conversation room
    func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }

        wsLogger.debug("[WebSocket] Leaving conversation room: \(conversationId)")

        emitIfConnected(EnvironmentConfig.SocketEvent.conversationLeave, data: [
            "conversationId": conversationId
        ])

        joinedConversations.remove(conversationId)
    }

    /// Leave all conversation rooms (called on logout)
    func leaveAllConversations() {
        for conversationId in joinedConversations {
            emitIfConnected(EnvironmentConfig.SocketEvent.conversationLeave, data: [
                "conversationId": conversationId
            ])
        }
        joinedConversations.removeAll()
        wsLogger.info("[WebSocket] Left all conversation rooms")
    }

    /// Rejoin all tracked conversations (called after reconnection)
    private func rejoinConversations() {
        guard !joinedConversations.isEmpty else { return }

        let conversationIds = Array(joinedConversations)
        wsLogger.info("[WebSocket] Rejoining \(conversationIds.count) conversation rooms after reconnect")

        emit(EnvironmentConfig.SocketEvent.conversationJoinMultiple, data: [
            "conversationIds": conversationIds
        ], priority: .high)
    }

    // MARK: - Typing Indicator

    /// Start typing indicator for a conversation
    /// Uses low priority - dropped when disconnected
    func startTyping(conversationId: String) {
        emit(EnvironmentConfig.SocketEvent.typingStart, data: [
            "conversationId": conversationId
        ], priority: .low)
    }

    /// Stop typing indicator for a conversation
    /// Uses emitIfConnected - silent fail when disconnected
    func stopTyping(conversationId: String) {
        emitIfConnected(EnvironmentConfig.SocketEvent.typingStop, data: [
            "conversationId": conversationId
        ])
    }

    /// Legacy method for backward compatibility
    func sendTypingIndicator(conversationId: String, isTyping: Bool) {
        if isTyping {
            startTyping(conversationId: conversationId)
        } else {
            stopTyping(conversationId: conversationId)
        }
    }

    // MARK: - Reactions

    /// Add a reaction to a message via WebSocket
    func addReaction(messageId: String, emoji: String) {
        emit(EnvironmentConfig.SocketEvent.reactionAdd, data: [
            "messageId": messageId,
            "emoji": emoji
        ], priority: .high)
    }

    /// Remove a reaction from a message via WebSocket
    func removeReaction(messageId: String, emoji: String) {
        emit(EnvironmentConfig.SocketEvent.reactionRemove, data: [
            "messageId": messageId,
            "emoji": emoji
        ], priority: .high)
    }

    /// Request sync of reactions for a message after reconnection
    func requestReactionSync(messageId: String) {
        emit(EnvironmentConfig.SocketEvent.reactionRequestSync, data: [
            "messageId": messageId
        ], priority: .normal)
    }

    // MARK: - Messages via WebSocket

    /// Send a message via WebSocket (real-time)
    func sendMessage(conversationId: String, content: String, originalLanguage: String? = nil, replyToId: String? = nil) {
        var data: [String: Any] = [
            "conversationId": conversationId,
            "content": content
        ]
        if let lang = originalLanguage {
            data["originalLanguage"] = lang
        }
        if let replyId = replyToId {
            data["replyToId"] = replyId
        }
        emit(EnvironmentConfig.SocketEvent.messageSend, data: data, priority: .high)
    }

    /// Send a message with attachments via WebSocket
    func sendMessageWithAttachments(conversationId: String, content: String, attachmentIds: [String], originalLanguage: String? = nil, replyToId: String? = nil) {
        var data: [String: Any] = [
            "conversationId": conversationId,
            "content": content,
            "attachmentIds": attachmentIds
        ]
        if let lang = originalLanguage {
            data["originalLanguage"] = lang
        }
        if let replyId = replyToId {
            data["replyToId"] = replyId
        }
        emit(EnvironmentConfig.SocketEvent.messageSendWithAttachments, data: data, priority: .high)
    }

    /// Edit a message via WebSocket
    func editMessage(messageId: String, content: String) {
        emit(EnvironmentConfig.SocketEvent.messageEdit, data: [
            "messageId": messageId,
            "content": content
        ], priority: .high)
    }

    /// Delete a message via WebSocket
    func deleteMessage(messageId: String) {
        emit(EnvironmentConfig.SocketEvent.messageDelete, data: [
            "messageId": messageId
        ], priority: .high)
    }

    // MARK: - Read Receipts

    func sendReadReceipt(messageId: String) {
        emit(EnvironmentConfig.SocketEvent.messageRead, data: [
            "messageId": messageId,
            "readAt": ISO8601DateFormatter().string(from: Date())
        ], priority: .normal)
    }

    // MARK: - Message Status Updates

    /// Mark a message as received (when notification arrives while conversation is not open)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - messageId: The message ID to mark as received
    func sendReceivedStatus(conversationId: String, messageId: String) {
        emit(EnvironmentConfig.SocketEvent.statusUpdate, data: [
            "conversationId": conversationId,
            "messageId": messageId,
            "status": "received",
            "receivedAt": ISO8601DateFormatter().string(from: Date())
        ], priority: .normal)
    }

    /// Mark a message as read (when conversation is opened)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - messageId: The message ID to mark as read
    func sendReadStatus(conversationId: String, messageId: String) {
        emit(EnvironmentConfig.SocketEvent.statusUpdate, data: [
            "conversationId": conversationId,
            "messageId": messageId,
            "status": "read",
            "readAt": ISO8601DateFormatter().string(from: Date())
        ], priority: .normal)
    }

    // MARK: - Utility

    /// Check if socket is ready for communication
    var isReady: Bool {
        isConnected && isAuthenticated
    }

    /// Force reconnect
    func reconnect() async {
        disconnect()
        try? await Task.sleep(nanoseconds: 500_000_000) // 500ms
        await connect()
    }
}

// MARK: - WebSocket Notification Names

extension Notification.Name {
    // Message events
    static let messageReceived = Notification.Name("messageReceived")
    static let messageUpdated = Notification.Name("messageUpdated")
    static let messageDeleted = Notification.Name("messageDeleted")
    static let messageTranslationReceived = Notification.Name("messageTranslationReceived")

    // User events
    static let userPresenceChanged = Notification.Name("userPresenceChanged")
    static let userStartedTyping = Notification.Name("userStartedTyping")
    static let userStoppedTyping = Notification.Name("userStoppedTyping")

    // Reaction events
    static let reactionSyncReceived = Notification.Name("reactionSyncReceived")

    // Notification events
    static let notificationReceived = Notification.Name("notificationReceived")

    // Read status events
    static let readStatusUpdated = Notification.Name("readStatusUpdated")
}
