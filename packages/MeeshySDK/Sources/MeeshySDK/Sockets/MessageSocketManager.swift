import Foundation
import SocketIO
import Combine
import os

// MARK: - Message Socket Event Data

public struct MessageDeletedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

public struct ReactionAggregationEvent: Decodable, Sendable {
    public let emoji: String
    public let count: Int
    public let participantIds: [String]?
    public let hasCurrentUser: Bool?
}

public struct ReactionUpdateEvent: Decodable, Sendable {
    public let messageId: String
    public let participantId: String?
    public let emoji: String
    public let action: String?
    public let aggregation: ReactionAggregationEvent?
    public let timestamp: String?

    public var count: Int { aggregation?.count ?? 0 }
}

public struct TypingEvent: Decodable, Sendable {
    public let userId: String
    public let username: String
    public let conversationId: String

    public init(userId: String, username: String, conversationId: String) {
        self.userId = userId; self.username = username; self.conversationId = conversationId
    }
}

public struct UnreadUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let unreadCount: Int

    public init(conversationId: String, unreadCount: Int) {
        self.conversationId = conversationId; self.unreadCount = unreadCount
    }
}

public struct UserStatusEvent: Decodable, Sendable {
    public let userId: String
    public let username: String
    public let isOnline: Bool
    public let lastActiveAt: Date?

    public init(userId: String, username: String, isOnline: Bool, lastActiveAt: Date? = nil) {
        self.userId = userId; self.username = username
        self.isOnline = isOnline; self.lastActiveAt = lastActiveAt
    }
}

// MARK: - Translation Event Data

public struct TranslationData: Decodable, Sendable {
    public let id: String
    public let messageId: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let translatedContent: String
    public let translationModel: String
    public let confidenceScore: Double?
}

public struct TranslationEvent: Decodable, Sendable {
    public let messageId: String
    public let translations: [TranslationData]
}

// MARK: - Transcription Event Data

public struct TranscriptionSegment: Decodable, Sendable {
    public let text: String
    public let startTime: Double?
    public let endTime: Double?
    public let speakerId: String?
    public let voiceSimilarityScore: Double?

    private enum CodingKeys: String, CodingKey {
        case text, startMs, endMs, startTime, endTime, speakerId, voiceSimilarityScore
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        speakerId = try c.decodeIfPresent(String.self, forKey: .speakerId)
        voiceSimilarityScore = try c.decodeIfPresent(Double.self, forKey: .voiceSimilarityScore)
        if let ms = try c.decodeIfPresent(Double.self, forKey: .startMs) {
            startTime = ms / 1000.0
        } else {
            startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        }
        if let ms = try c.decodeIfPresent(Double.self, forKey: .endMs) {
            endTime = ms / 1000.0
        } else {
            endTime = try c.decodeIfPresent(Double.self, forKey: .endTime)
        }
    }
}

public struct TranscriptionData: Decodable, Sendable {
    public let id: String?
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?
}

public struct TranscriptionReadyEvent: Decodable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let transcription: TranscriptionData
    public let processingTimeMs: Int?
}

// MARK: - Audio Translation Event Data

public struct TranslatedAudioInfo: Decodable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let url: String
    public let transcription: String
    public let durationMs: Int
    public let format: String
    public let cloned: Bool
    public let quality: Double
    public let ttsModel: String
    public let segments: [TranscriptionSegment]?
}

public struct AudioTranslationEvent: Decodable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let language: String
    public let translatedAudio: TranslatedAudioInfo
    public let processingTimeMs: Int?
}

public struct ReadStatusSummary: Decodable, Sendable {
    public let totalMembers: Int
    public let deliveredCount: Int
    public let readCount: Int
}

public struct ReadStatusUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let participantId: String
    public let userId: String?
    public let type: String
    public let updatedAt: Date
    public let summary: ReadStatusSummary
}

// MARK: - Participant Role Updated Event Data

public struct ParticipantRoleUpdatedParticipantInfo: Decodable, Sendable {
    public let id: String
    public let role: String
    public let displayName: String
    public let userId: String?
}

public struct ParticipantRoleUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let newRole: String
    public let updatedBy: String
    public let participant: ParticipantRoleUpdatedParticipantInfo
}

public struct MessageConsumedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let viewOnceCount: Int
    public let maxViewOnceCount: Int
    public let isFullyConsumed: Bool
}

// MARK: - Call Signaling Event Data

public struct CallOfferData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    public let mode: String?
    public let initiator: CallInitiatorInfo

    public struct CallInitiatorInfo: Decodable, Sendable {
        public let userId: String
        public let username: String
        public let avatar: String?
    }
}

public struct CallAnswerData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallSignalPayload: Decodable, Sendable {
    public let type: String
    public let sdp: String?
    public let candidate: String?
    public let sdpMLineIndex: Int?
    public let sdpMid: String?
    public let from: String?
    public let to: String?
}

public struct CallICECandidateData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallEndData: Decodable, Sendable {
    public let callId: String
    public let duration: Int?
    public let endedBy: String?
}

public struct CallParticipantData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let userId: String?
    public let mode: String?
}

public struct CallMediaToggleData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let mediaType: String
    public let enabled: Bool
}

public struct CallErrorData: Decodable, Sendable {
    public let code: String?
    public let message: String?
}

// MARK: - Reaction Sync Event Data

public struct ReactionSyncEvent: Decodable, Sendable {
    public let messageId: String
    public let reactions: [ReactionAggregationEvent]
    public let totalCount: Int?
    public let userReactions: [String]?
}

// MARK: - System Message Event Data

public struct SystemMessageEvent: Decodable, Sendable {
    public let type: String
    public let content: String
}

// MARK: - Attachment Status Event Data

public struct AttachmentStatusEvent: Decodable, Sendable {
    public let attachmentId: String
    public let status: String
}

// MARK: - Mention Event Data

public struct MentionCreatedEvent: Decodable, Sendable {
    public let messageId: String?
    public let conversationId: String?
    public let userId: String?
}

// MARK: - Notification Socket Event Data

public struct SocketNotificationEvent: Decodable, Sendable {
    public let id: String
    public let userId: String
    public let type: String
    public let title: String
    public let content: String
    public let priority: String?
    public let isRead: Bool?
    public let senderUsername: String?
    public let senderDisplayName: String?
    public let senderAvatar: String?
    public let messagePreview: String?
    public let conversationId: String?
    public let messageId: String?

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }
}

// MARK: - Connection State

public enum ConnectionState: Equatable, Sendable {
    case connected
    case connecting
    case reconnecting(attempt: Int)
    case disconnected
}

// MARK: - Protocol

public protocol MessageSocketProviding: Sendable {
    var messageReceived: PassthroughSubject<APIMessage, Never> { get }
    var messageEdited: PassthroughSubject<APIMessage, Never> { get }
    var messageDeleted: PassthroughSubject<MessageDeletedEvent, Never> { get }
    var reactionAdded: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var reactionRemoved: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var typingStarted: PassthroughSubject<TypingEvent, Never> { get }
    var typingStopped: PassthroughSubject<TypingEvent, Never> { get }
    var unreadUpdated: PassthroughSubject<UnreadUpdateEvent, Never> { get }
    var userStatusChanged: PassthroughSubject<UserStatusEvent, Never> { get }
    var readStatusUpdated: PassthroughSubject<ReadStatusUpdateEvent, Never> { get }
    var participantRoleUpdated: PassthroughSubject<ParticipantRoleUpdatedEvent, Never> { get }
    var messageConsumed: PassthroughSubject<MessageConsumedEvent, Never> { get }
    var locationShared: PassthroughSubject<LocationSharedEvent, Never> { get }
    var liveLocationStarted: PassthroughSubject<LiveLocationStartedEvent, Never> { get }
    var liveLocationUpdated: PassthroughSubject<LiveLocationUpdatedEvent, Never> { get }
    var liveLocationStopped: PassthroughSubject<LiveLocationStoppedEvent, Never> { get }
    var translationReceived: PassthroughSubject<TranslationEvent, Never> { get }
    var transcriptionReady: PassthroughSubject<TranscriptionReadyEvent, Never> { get }
    var audioTranslationReady: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationProgressive: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationCompleted: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var didReconnect: PassthroughSubject<Void, Never> { get }
    var notificationReceived: PassthroughSubject<SocketNotificationEvent, Never> { get }
    var callOfferReceived: PassthroughSubject<CallOfferData, Never> { get }
    var callAnswerReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callICECandidateReceived: PassthroughSubject<CallICECandidateData, Never> { get }
    var callEnded: PassthroughSubject<CallEndData, Never> { get }
    var callParticipantJoined: PassthroughSubject<CallParticipantData, Never> { get }
    var callParticipantLeft: PassthroughSubject<CallParticipantData, Never> { get }
    var callMediaToggled: PassthroughSubject<CallMediaToggleData, Never> { get }
    var callError: PassthroughSubject<CallErrorData, Never> { get }
    var reactionSynced: PassthroughSubject<ReactionSyncEvent, Never> { get }
    var systemMessageReceived: PassthroughSubject<SystemMessageEvent, Never> { get }
    var attachmentStatusUpdated: PassthroughSubject<AttachmentStatusEvent, Never> { get }
    var mentionCreated: PassthroughSubject<MentionCreatedEvent, Never> { get }
    var isConnected: Bool { get }
    var connectionState: ConnectionState { get }
    var activeConversationId: String? { get set }
    func connect()
    func connectAnonymous(sessionToken: String)
    func disconnect()
    func joinConversation(_ conversationId: String)
    func leaveConversation(_ conversationId: String)
    func emitTypingStart(conversationId: String)
    func emitTypingStop(conversationId: String)
    func requestTranslation(messageId: String, targetLanguage: String)
    func emitLocationShare(payload: LocationSharePayload)
    func emitLiveLocationStart(payload: LiveLocationStartPayload)
    func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload)
    func emitLiveLocationStop(conversationId: String)
    func sendWithAttachments(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, isEncrypted: Bool)
    func emitCallInitiate(conversationId: String, isVideo: Bool)
    func emitCallJoin(callId: String)
    func emitCallLeave(callId: String)
    func emitCallSignal(callId: String, type: String, payload: [String: String])
    func emitCallToggleAudio(callId: String, enabled: Bool)
    func emitCallToggleVideo(callId: String, enabled: Bool)
    func emitCallEnd(callId: String)
}

// MARK: - Message Socket Manager

public final class MessageSocketManager: ObservableObject, MessageSocketProviding, @unchecked Sendable {
    public static let shared = MessageSocketManager()

    // Combine publishers — messages
    public let messageReceived = PassthroughSubject<APIMessage, Never>()
    public let messageEdited = PassthroughSubject<APIMessage, Never>()
    public let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()

    // Combine publishers — reactions
    public let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()

    // Combine publishers — typing
    public let typingStarted = PassthroughSubject<TypingEvent, Never>()
    public let typingStopped = PassthroughSubject<TypingEvent, Never>()

    // Combine publishers — presence
    public let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    public let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()

    // Combine publishers — read status
    public let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()

    // Combine publishers — participant role
    public let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()

    // Combine publishers — view-once
    public let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()

    // Combine publishers — location sharing
    public let locationShared = PassthroughSubject<LocationSharedEvent, Never>()
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

    // Combine publisher — reconnection (fires after successful reconnect)
    public let didReconnect = PassthroughSubject<Void, Never>()

    // Combine publishers — notifications
    public let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()

    // Combine publishers — call signaling
    public let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    public let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    public let callEnded = PassthroughSubject<CallEndData, Never>()
    public let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    public let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    public let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    public let callError = PassthroughSubject<CallErrorData, Never>()

    // Combine publishers — reactions sync, system, attachments, mentions
    public let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    public let systemMessageReceived = PassthroughSubject<SystemMessageEvent, Never>()
    public let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusEvent, Never>()
    public let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    // The currently active (foreground) conversation for priority re-join
    public var activeConversationId: String?

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()
    private var joinedConversations: Set<String> = []
    private var reconnectAttempt: Int = 0
    private var hadPreviousConnection = false
    private var heartbeatTimer: Timer?

    // Cached formatters — ISO8601DateFormatter is expensive to allocate.
    // Safe to share: options are set once during init and never mutated after.
    private nonisolated(unsafe) static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private nonisolated(unsafe) static let isoFormatterBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private init() {
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = MessageSocketManager.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = MessageSocketManager.isoFormatterBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
    }

    // MARK: - Connection

    public func connect() {
        guard socket == nil || socket?.status != .connected else { return }

        guard let token = APIClient.shared.authToken else {
            Logger.socket.warning("No auth token, skipping connect")
            return
        }

        guard let url = SocketConfig.baseURL else { return }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .extraHeaders(["Authorization": "Bearer \(token)"]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    public func connectAnonymous(sessionToken: String) {
        disconnect()

        guard let url = SocketConfig.baseURL else { return }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .extraHeaders(["X-Session-Token": sessionToken]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    public func disconnect() {
        stopHeartbeat()
        joinedConversations.removeAll()
        activeConversationId = nil
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
        hadPreviousConnection = false
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.socket?.emit("heartbeat")
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    // MARK: - Room Management

    public func joinConversation(_ conversationId: String) {
        guard !joinedConversations.contains(conversationId) else { return }
        socket?.emit("conversation:join", ["conversationId": conversationId])
        joinedConversations.insert(conversationId)
        Logger.socket.info("Joined conversation: \(conversationId)")
    }

    public func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }
        socket?.emit("conversation:leave", ["conversationId": conversationId])
        joinedConversations.remove(conversationId)
        Logger.socket.info("Left conversation: \(conversationId)")
    }

    // MARK: - Typing Emission

    public func emitTypingStart(conversationId: String) {
        socket?.emit("typing:start", ["conversationId": conversationId])
    }

    public func emitTypingStop(conversationId: String) {
        socket?.emit("typing:stop", ["conversationId": conversationId])
    }

    // MARK: - Translation Request

    public func requestTranslation(messageId: String, targetLanguage: String) {
        socket?.emit("translation:request", ["messageId": messageId, "targetLanguage": targetLanguage])
        Logger.socket.info("Requested translation for \(messageId) -> \(targetLanguage)")
    }

    // MARK: - Location Emission

    public func emitLocationShare(payload: LocationSharePayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        socket?.emit("location:share", dict)
    }

    public func emitLiveLocationStart(payload: LiveLocationStartPayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        socket?.emit("location:live-start", dict)
    }

    public func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        socket?.emit("location:live-update", dict)
    }

    public func emitLiveLocationStop(conversationId: String) {
        socket?.emit("location:live-stop", ["conversationId": conversationId])
    }

    // MARK: - Send With Attachments

    public func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        isEncrypted: Bool = false
    ) {
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "attachmentIds": attachmentIds,
            "isEncrypted": isEncrypted
        ]
        if let content, !content.isEmpty { payload["content"] = content }
        if let replyToId { payload["replyToId"] = replyToId }
        socket?.emit("message:send-with-attachments", payload)
    }

    // MARK: - Call Signaling Emission

    public func emitCallInitiate(conversationId: String, isVideo: Bool) {
        socket?.emit("call:initiate", [
            "conversationId": conversationId,
            "type": isVideo ? "video" : "audio"
        ])
    }

    public func emitCallJoin(callId: String) {
        socket?.emit("call:join", ["callId": callId])
    }

    public func emitCallLeave(callId: String) {
        socket?.emit("call:leave", ["callId": callId])
    }

    public func emitCallSignal(callId: String, type: String, payload: [String: String]) {
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        socket?.emit("call:signal", ["callId": callId, "signal": signal])
    }

    public func emitCallToggleAudio(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-audio", ["callId": callId, "enabled": enabled])
    }

    public func emitCallToggleVideo(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-video", ["callId": callId, "enabled": enabled])
    }

    public func emitCallEnd(callId: String) {
        socket?.emit("call:end", ["callId": callId])
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            let wasReconnect = self.hadPreviousConnection
            self.hadPreviousConnection = true
            self.reconnectAttempt = 0

            DispatchQueue.main.async {
                self.isConnected = true
                self.connectionState = .connected
            }

            self.startHeartbeat()

            // Re-join all tracked conversations
            // Priority: active conversation first for fastest UX
            if let activeId = self.activeConversationId, self.joinedConversations.contains(activeId) {
                self.socket?.emit("conversation:join", ["conversationId": activeId])
            }
            for convId in self.joinedConversations where convId != self.activeConversationId {
                self.socket?.emit("conversation:join", ["conversationId": convId])
            }

            if wasReconnect {
                Logger.socket.info("MessageSocket reconnected — re-joined \(self.joinedConversations.count) room(s)")
                DispatchQueue.main.async { self.didReconnect.send(()) }
            } else {
                Logger.socket.info("MessageSocket connected")
            }
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            guard let self else { return }
            self.stopHeartbeat()
            DispatchQueue.main.async {
                self.isConnected = false
                if self.hadPreviousConnection {
                    self.connectionState = .reconnecting(attempt: 0)
                } else {
                    self.connectionState = .disconnected
                }
            }
            Logger.socket.info("MessageSocket disconnected")
        }

        socket.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            guard let self else { return }
            self.reconnectAttempt += 1
            let attempt = self.reconnectAttempt
            DispatchQueue.main.async {
                self.connectionState = .reconnecting(attempt: attempt)
            }
            Logger.socket.info("MessageSocket reconnect attempt \(attempt)")
        }

        socket.on(clientEvent: .error) { _, args in
            Logger.socket.error("MessageSocket error: \(args)")
        }

        // --- Message events ---

        socket.on("message:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageReceived.send(msg)
            }
        }

        socket.on("message:edited") { [weak self] data, _ in
            guard let self else { return }
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageEdited.send(msg)
            }
        }

        socket.on("message:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageDeletedEvent.self, from: data) { [weak self] event in
                self?.messageDeleted.send(event)
            }
        }

        // --- Reaction events ---

        socket.on("reaction:added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionAdded.send(event)
            }
        }

        socket.on("reaction:removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionRemoved.send(event)
            }
        }

        // --- Typing events ---

        socket.on("typing:start") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStarted.send(event)
            }
        }

        socket.on("typing:stop") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStopped.send(event)
            }
        }

        // --- Unread events ---

        socket.on("conversation:unread-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UnreadUpdateEvent.self, from: data) { [weak self] event in
                self?.unreadUpdated.send(event)
            }
        }

        // --- User status events ---

        socket.on("user:status") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserStatusEvent.self, from: data) { [weak self] event in
                self?.userStatusChanged.send(event)
            }
        }

        // --- Translation events ---

        socket.on("message:translation") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationEvent.self, from: data) { [weak self] event in
                self?.translationReceived.send(event)
            }
        }

        socket.on("message:translated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationEvent.self, from: data) { [weak self] event in
                self?.translationReceived.send(event)
            }
        }

        // --- Transcription events ---

        socket.on("audio:transcription-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionReadyEvent.self, from: data) { [weak self] event in
                self?.transcriptionReady.send(event)
            }
        }

        // --- Audio translation events ---

        socket.on("audio:translation-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationReady.send(event)
            }
        }

        socket.on("audio:translations-progressive") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationProgressive.send(event)
            }
        }

        socket.on("audio:translations-completed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationCompleted.send(event)
            }
        }

        // --- Read status events ---

        socket.on("read-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReadStatusUpdateEvent.self, from: data) { [weak self] event in
                self?.readStatusUpdated.send(event)
            }
        }

        socket.on("message:consumed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageConsumedEvent.self, from: data) { [weak self] event in
                self?.messageConsumed.send(event)
            }
        }

        // --- Participant role events ---

        socket.on("participant:role-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantRoleUpdatedEvent.self, from: data) { [weak self] event in
                self?.participantRoleUpdated.send(event)
            }
        }

        // --- Location events ---

        socket.on("location:shared") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LocationSharedEvent.self, from: data) { [weak self] event in
                self?.locationShared.send(event)
            }
        }

        socket.on("location:live-started") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStartedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStarted.send(event)
            }
        }

        socket.on("location:live-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationUpdatedEvent.self, from: data) { [weak self] event in
                self?.liveLocationUpdated.send(event)
            }
        }

        socket.on("location:live-stopped") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStoppedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStopped.send(event)
            }
        }

        // --- Notification events ---

        socket.on("notification") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketNotificationEvent.self, from: data) { [weak self] event in
                self?.notificationReceived.send(event)
            }
        }

        // --- Call signaling events ---

        socket.on("call:initiated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallOfferData.self, from: data) { [weak self] event in
                self?.callOfferReceived.send(event)
            }
        }

        socket.on("call:signal") { [weak self] data, _ in
            guard let self else { return }
            guard let first = data.first as? [String: Any],
                  let signalDict = first["signal"] as? [String: Any],
                  let signalType = signalDict["type"] as? String else { return }

            switch signalType {
            case "answer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callAnswerReceived.send(event)
                }
            case "ice-candidate":
                self.decode(CallICECandidateData.self, from: data) { [weak self] event in
                    self?.callICECandidateReceived.send(event)
                }
            default:
                Logger.socket.info("Unknown call signal type: \(signalType)")
            }
        }

        socket.on("call:ended") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallEndData.self, from: data) { [weak self] event in
                self?.callEnded.send(event)
            }
        }

        socket.on("call:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                self?.callParticipantJoined.send(event)
            }
        }

        socket.on("call:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                self?.callParticipantLeft.send(event)
            }
        }

        socket.on("call:media-toggled") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMediaToggleData.self, from: data) { [weak self] event in
                self?.callMediaToggled.send(event)
            }
        }

        socket.on("call:error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallErrorData.self, from: data) { [weak self] event in
                self?.callError.send(event)
            }
        }

        // --- Reaction sync events ---

        socket.on("reaction:sync") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReactionSyncEvent.self, from: data) { [weak self] event in
                self?.reactionSynced.send(event)
            }
        }

        // --- System message events ---

        socket.on("system:message") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SystemMessageEvent.self, from: data) { [weak self] event in
                self?.systemMessageReceived.send(event)
            }
        }

        // --- Attachment status events ---

        socket.on("attachment-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentStatusEvent.self, from: data) { [weak self] event in
                self?.attachmentStatusUpdated.send(event)
            }
        }

        // --- Mention events ---

        socket.on("mention:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MentionCreatedEvent.self, from: data) { [weak self] event in
                self?.mentionCreated.send(event)
            }
        }
    }

    // MARK: - Decode Helper

    private nonisolated func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @Sendable (T) -> Void) {
        guard let first = data.first else { return }

        do {
            let jsonData: Data
            if let dict = first as? [String: Any] {
                jsonData = try JSONSerialization.data(withJSONObject: dict)
            } else if let str = first as? String {
                jsonData = Data(str.utf8)
            } else {
                return
            }

            let decoded = try decoder.decode(type, from: jsonData)
            DispatchQueue.main.async {
                handler(decoded)
            }
        } catch {
            Logger.socket.error("Decode error for \(String(describing: type)): \(error)")
        }
    }
}
