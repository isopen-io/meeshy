import Foundation
import SocketIO
import Combine

// MARK: - Message Socket Event Data

public struct MessageDeletedEvent: Decodable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

public struct ReactionUpdateEvent: Decodable {
    public let messageId: String
    public let emoji: String
    public let count: Int
    public let userId: String?
    public let conversationId: String?

    public init(messageId: String, emoji: String, count: Int, userId: String? = nil, conversationId: String? = nil) {
        self.messageId = messageId; self.emoji = emoji; self.count = count
        self.userId = userId; self.conversationId = conversationId
    }
}

public struct TypingEvent: Decodable {
    public let userId: String
    public let username: String
    public let conversationId: String

    public init(userId: String, username: String, conversationId: String) {
        self.userId = userId; self.username = username; self.conversationId = conversationId
    }
}

public struct UnreadUpdateEvent: Decodable {
    public let conversationId: String
    public let unreadCount: Int

    public init(conversationId: String, unreadCount: Int) {
        self.conversationId = conversationId; self.unreadCount = unreadCount
    }
}

public struct UserStatusEvent: Decodable {
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

public struct TranslationData: Decodable {
    public let id: String
    public let messageId: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let translatedContent: String
    public let translationModel: String
    public let confidenceScore: Double?
}

public struct TranslationEvent: Decodable {
    public let messageId: String
    public let translations: [TranslationData]
}

// MARK: - Transcription Event Data

public struct TranscriptionSegment: Decodable {
    public let text: String
    public let startTime: Double?
    public let endTime: Double?
    public let speakerId: String?
    public let voiceSimilarityScore: Double?
}

public struct TranscriptionData: Decodable {
    public let id: String?
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?
}

public struct TranscriptionReadyEvent: Decodable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let transcription: TranscriptionData
    public let processingTimeMs: Int?
}

// MARK: - Audio Translation Event Data

public struct TranslatedAudioInfo: Decodable {
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

public struct AudioTranslationEvent: Decodable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let language: String
    public let translatedAudio: TranslatedAudioInfo
    public let processingTimeMs: Int?
}

// MARK: - Message Socket Manager

public final class MessageSocketManager: ObservableObject {
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

    // Combine publishers — translation
    public let translationReceived = PassthroughSubject<TranslationEvent, Never>()

    // Combine publishers — transcription & audio
    public let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    public let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()

    @Published public var isConnected = false

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()
    private var joinedConversations: Set<String> = []

    private init() {
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
    }

    // MARK: - Connection

    public func connect() {
        guard socket == nil || socket?.status != .connected else { return }

        guard let token = APIClient.shared.authToken else {
            print("[MessageSocket] No auth token, skipping connect")
            return
        }

        guard let url = SocketConfig.baseURL else { return }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .extraHeaders(["Authorization": "Bearer \(token)"]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(3),
            .reconnectWaitMax(30),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    public func disconnect() {
        joinedConversations.removeAll()
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
    }

    // MARK: - Room Management

    public func joinConversation(_ conversationId: String) {
        guard !joinedConversations.contains(conversationId) else { return }
        socket?.emit("conversation:join", ["conversationId": conversationId])
        joinedConversations.insert(conversationId)
        print("[MessageSocket] Joined conversation:\(conversationId)")
    }

    public func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }
        socket?.emit("conversation:leave", ["conversationId": conversationId])
        joinedConversations.remove(conversationId)
        print("[MessageSocket] Left conversation:\(conversationId)")
    }

    // MARK: - Typing Emission

    public func emitTypingStart(conversationId: String) {
        socket?.emit("typing:start", ["conversationId": conversationId])
    }

    public func emitTypingStop(conversationId: String) {
        socket?.emit("typing:stop", ["conversationId": conversationId])
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            DispatchQueue.main.async { self.isConnected = true }
            // Re-join conversations on reconnect
            for convId in self.joinedConversations {
                self.socket?.emit("conversation:join", ["conversationId": convId])
            }
            print("[MessageSocket] Connected")
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async { self?.isConnected = false }
            print("[MessageSocket] Disconnected")
        }

        socket.on(clientEvent: .error) { _, args in
            print("[MessageSocket] Error: \(args)")
        }

        // --- Message events ---

        socket.on("message:new") { [weak self] data, _ in
            self?.decode(APIMessage.self, from: data) { msg in
                self?.messageReceived.send(msg)
            }
        }

        socket.on("message:edited") { [weak self] data, _ in
            self?.decode(APIMessage.self, from: data) { msg in
                self?.messageEdited.send(msg)
            }
        }

        socket.on("message:deleted") { [weak self] data, _ in
            self?.decode(MessageDeletedEvent.self, from: data) { event in
                self?.messageDeleted.send(event)
            }
        }

        // --- Reaction events ---

        socket.on("reaction:added") { [weak self] data, _ in
            self?.decode(ReactionUpdateEvent.self, from: data) { event in
                self?.reactionAdded.send(event)
            }
        }

        socket.on("reaction:removed") { [weak self] data, _ in
            self?.decode(ReactionUpdateEvent.self, from: data) { event in
                self?.reactionRemoved.send(event)
            }
        }

        // --- Typing events ---

        socket.on("typing:start") { [weak self] data, _ in
            self?.decode(TypingEvent.self, from: data) { event in
                self?.typingStarted.send(event)
            }
        }

        socket.on("typing:stop") { [weak self] data, _ in
            self?.decode(TypingEvent.self, from: data) { event in
                self?.typingStopped.send(event)
            }
        }

        // --- Unread events ---

        socket.on("conversation:unread-updated") { [weak self] data, _ in
            self?.decode(UnreadUpdateEvent.self, from: data) { event in
                self?.unreadUpdated.send(event)
            }
        }

        // --- User status events ---

        socket.on("user:status") { [weak self] data, _ in
            self?.decode(UserStatusEvent.self, from: data) { event in
                self?.userStatusChanged.send(event)
            }
        }

        // --- Translation events ---

        socket.on("message:translation") { [weak self] data, _ in
            self?.decode(TranslationEvent.self, from: data) { event in
                self?.translationReceived.send(event)
            }
        }

        socket.on("message:translated") { [weak self] data, _ in
            self?.decode(TranslationEvent.self, from: data) { event in
                self?.translationReceived.send(event)
            }
        }

        // --- Transcription events ---

        socket.on("audio:transcription-ready") { [weak self] data, _ in
            self?.decode(TranscriptionReadyEvent.self, from: data) { event in
                self?.transcriptionReady.send(event)
            }
        }

        // --- Audio translation events ---

        socket.on("audio:translation-ready") { [weak self] data, _ in
            self?.decode(AudioTranslationEvent.self, from: data) { event in
                self?.audioTranslationReady.send(event)
            }
        }

        socket.on("audio:translations-progressive") { [weak self] data, _ in
            self?.decode(AudioTranslationEvent.self, from: data) { event in
                self?.audioTranslationProgressive.send(event)
            }
        }

        socket.on("audio:translations-completed") { [weak self] data, _ in
            self?.decode(AudioTranslationEvent.self, from: data) { event in
                self?.audioTranslationCompleted.send(event)
            }
        }
    }

    // MARK: - Decode Helper

    private func decode<T: Decodable>(_ type: T.Type, from data: [Any], handler: @escaping (T) -> Void) {
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
            print("[MessageSocket] Decode error for \(type): \(error)")
        }
    }
}
