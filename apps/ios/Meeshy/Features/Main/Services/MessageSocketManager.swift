import Foundation
import SocketIO
import Combine
import MeeshySDK

// MARK: - Message Socket Event Data

struct MessageDeletedEvent: Decodable {
    let messageId: String
    let conversationId: String
}

struct ReactionUpdateEvent: Decodable {
    let messageId: String
    let emoji: String
    let count: Int
    let userId: String?
    let conversationId: String?
}

struct TypingEvent: Decodable {
    let userId: String
    let username: String
    let conversationId: String
}

struct UnreadUpdateEvent: Decodable {
    let conversationId: String
    let unreadCount: Int
}

struct UserStatusEvent: Decodable {
    let userId: String
    let username: String
    let isOnline: Bool
    let lastActiveAt: Date?
}

// MARK: - Message Socket Manager

final class MessageSocketManager: ObservableObject {
    static let shared = MessageSocketManager()

    // Combine publishers
    let messageReceived = PassthroughSubject<APIMessage, Never>()
    let messageEdited = PassthroughSubject<APIMessage, Never>()
    let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()
    let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    let typingStarted = PassthroughSubject<TypingEvent, Never>()
    let typingStopped = PassthroughSubject<TypingEvent, Never>()
    let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()

    @Published var isConnected = false

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()
    private var callEmitCancellables = Set<AnyCancellable>()

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
        setupCallEmitListeners()
    }

    // MARK: - Connection

    func connect() {
        guard socket == nil || socket?.status != .connected else { return }

        guard let token = APIClient.shared.authToken else {
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

    func disconnect() {
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
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async { self?.isConnected = false }
        }

        socket.on(clientEvent: .error) { _, _ in
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

        // --- Call signaling events ---

        socket.on("call:offer") { data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String,
                  let fromUserId = dict["fromUserId"] as? String,
                  let fromUsername = dict["fromUsername"] as? String,
                  let isVideo = dict["isVideo"] as? Bool,
                  let sdp = dict["sdp"] as? [String: Any] else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .callOfferReceived,
                    object: nil,
                    userInfo: [
                        "callId": callId, "fromUserId": fromUserId,
                        "fromUsername": fromUsername, "isVideo": isVideo, "sdp": sdp
                    ]
                )
            }
        }

        socket.on("call:answer") { data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String,
                  let sdp = dict["sdp"] as? [String: Any] else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .callAnswerReceived,
                    object: nil,
                    userInfo: ["callId": callId, "sdp": sdp]
                )
            }
        }

        socket.on("call:ice-candidate") { data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String,
                  let candidate = dict["candidate"] as? [String: Any] else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .callICECandidateReceived,
                    object: nil,
                    userInfo: ["callId": callId, "candidate": candidate]
                )
            }
        }

        socket.on("call:reject") { data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .callRejectReceived,
                    object: nil,
                    userInfo: ["callId": callId]
                )
            }
        }

        socket.on("call:end") { data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .callEndReceived,
                    object: nil,
                    userInfo: ["callId": callId]
                )
            }
        }
    }

    // MARK: - Call Emit Listeners (outgoing signaling)

    private func setupCallEmitListeners() {
        NotificationCenter.default.publisher(for: .callEmitOffer)
            .sink { [weak self] notification in
                guard let data = notification.userInfo else { return }
                self?.socket?.emit("call:offer", data)
            }
            .store(in: &callEmitCancellables)

        NotificationCenter.default.publisher(for: .callEmitAnswer)
            .sink { [weak self] notification in
                guard let data = notification.userInfo else { return }
                self?.socket?.emit("call:answer", data)
            }
            .store(in: &callEmitCancellables)

        NotificationCenter.default.publisher(for: .callEmitReject)
            .sink { [weak self] notification in
                guard let data = notification.userInfo else { return }
                self?.socket?.emit("call:reject", data)
            }
            .store(in: &callEmitCancellables)

        NotificationCenter.default.publisher(for: .callEmitEnd)
            .sink { [weak self] notification in
                guard let data = notification.userInfo else { return }
                self?.socket?.emit("call:end", data)
            }
            .store(in: &callEmitCancellables)
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
        } catch { }
    }
}
