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

// MARK: - Message Socket Manager

public final class MessageSocketManager: ObservableObject {
    public static let shared = MessageSocketManager()

    // Combine publishers
    public let messageReceived = PassthroughSubject<APIMessage, Never>()
    public let messageEdited = PassthroughSubject<APIMessage, Never>()
    public let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()
    public let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let typingStarted = PassthroughSubject<TypingEvent, Never>()
    public let typingStopped = PassthroughSubject<TypingEvent, Never>()
    public let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    public let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()

    @Published public var isConnected = false

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()

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
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async { self?.isConnected = true }
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
