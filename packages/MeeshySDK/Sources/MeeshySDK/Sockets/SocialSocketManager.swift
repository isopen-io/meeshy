import Foundation
import SocketIO
import Combine
import os

// MARK: - Socket.IO Event Data Models

public struct SocketPostCreatedData: Decodable, Sendable {
    public let post: APIPost
}

public struct SocketPostUpdatedData: Decodable, Sendable {
    public let post: APIPost
}

public struct SocketPostDeletedData: Decodable, Sendable {
    public let postId: String
    public let authorId: String
}

public struct SocketPostLikedData: Decodable, Sendable {
    public let postId: String
    public let userId: String
    public let emoji: String
    public let likeCount: Int
    public let reactionSummary: [String: Int]
}

public struct SocketPostUnlikedData: Decodable, Sendable {
    public let postId: String
    public let userId: String
    public let likeCount: Int
    public let reactionSummary: [String: Int]
}

public struct SocketPostRepostedData: Decodable, Sendable {
    public let originalPostId: String
    public let repost: APIPost
}

public struct SocketStoryCreatedData: Decodable, Sendable {
    public let story: APIPost
}

public struct SocketStoryViewedData: Decodable, Sendable {
    public let storyId: String
    public let viewerId: String
    public let viewerUsername: String
    public let viewCount: Int
}

public struct SocketStoryReactedData: Decodable, Sendable {
    public let storyId: String
    public let userId: String
    public let emoji: String
}

public struct SocketStatusCreatedData: Decodable, Sendable {
    public let status: APIPost
}

public struct SocketStatusDeletedData: Decodable, Sendable {
    public let statusId: String
    public let authorId: String
}

public struct SocketStatusReactedData: Decodable, Sendable {
    public let statusId: String
    public let userId: String
    public let emoji: String
}

public struct SocketCommentAddedData: Decodable, Sendable {
    public let postId: String
    public let comment: APIPostComment
    public let commentCount: Int
}

public struct SocketCommentDeletedData: Decodable, Sendable {
    public let postId: String
    public let commentId: String
    public let commentCount: Int
}

public struct SocketCommentLikedData: Decodable, Sendable {
    public let postId: String
    public let commentId: String
    public let userId: String
    public let likeCount: Int
}

public struct SocketPostBookmarkedData: Decodable, Sendable {
    public let postId: String
    public let bookmarked: Bool
}

public struct SocketStoryTranslationUpdatedData: Decodable, Sendable {
    public let postId: String
    public let textObjectIndex: Int
    public let translations: [String: String]
}

// Socket payloads use camelCase (unlike REST which uses snake_case)
public struct SocketTranslationPayload: Decodable, Sendable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?
    public let createdAt: String?
}

public struct SocketPostTranslationUpdatedData: Decodable, Sendable {
    public let postId: String
    public let language: String
    public let translation: SocketTranslationPayload
}

public struct SocketCommentTranslationUpdatedData: Decodable, Sendable {
    public let commentId: String
    public let postId: String
    public let language: String
    public let translation: SocketTranslationPayload
}

// MARK: - Protocol

public protocol SocialSocketProviding: Sendable {
    var postCreated: PassthroughSubject<APIPost, Never> { get }
    var postUpdated: PassthroughSubject<APIPost, Never> { get }
    var postDeleted: PassthroughSubject<String, Never> { get }
    var postLiked: PassthroughSubject<SocketPostLikedData, Never> { get }
    var postUnliked: PassthroughSubject<SocketPostUnlikedData, Never> { get }
    var postReposted: PassthroughSubject<SocketPostRepostedData, Never> { get }
    var postBookmarked: PassthroughSubject<SocketPostBookmarkedData, Never> { get }
    var storyCreated: PassthroughSubject<APIPost, Never> { get }
    var storyViewed: PassthroughSubject<SocketStoryViewedData, Never> { get }
    var storyReacted: PassthroughSubject<SocketStoryReactedData, Never> { get }
    var statusCreated: PassthroughSubject<APIPost, Never> { get }
    var statusDeleted: PassthroughSubject<String, Never> { get }
    var statusUpdated: PassthroughSubject<APIPost, Never> { get }
    var statusReacted: PassthroughSubject<SocketStatusReactedData, Never> { get }
    var commentAdded: PassthroughSubject<SocketCommentAddedData, Never> { get }
    var commentDeleted: PassthroughSubject<SocketCommentDeletedData, Never> { get }
    var commentLiked: PassthroughSubject<SocketCommentLikedData, Never> { get }
    var storyTranslationUpdated: PassthroughSubject<SocketStoryTranslationUpdatedData, Never> { get }
    var postTranslationUpdated: PassthroughSubject<SocketPostTranslationUpdatedData, Never> { get }
    var commentTranslationUpdated: PassthroughSubject<SocketCommentTranslationUpdatedData, Never> { get }
    var isConnected: Bool { get }
    var connectionState: ConnectionState { get }
    func connect()
    func disconnect()
    func subscribeFeed()
    func unsubscribeFeed()
}

// MARK: - Social Socket Manager

public final class SocialSocketManager: ObservableObject, SocialSocketProviding, @unchecked Sendable {
    public static let shared = SocialSocketManager()

    // Combine publishers for ViewModels to subscribe to
    public let postCreated = PassthroughSubject<APIPost, Never>()
    public let postUpdated = PassthroughSubject<APIPost, Never>()
    public let postDeleted = PassthroughSubject<String, Never>()
    public let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    public let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    public let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
    public let postBookmarked = PassthroughSubject<SocketPostBookmarkedData, Never>()
    public let storyCreated = PassthroughSubject<APIPost, Never>()
    public let storyViewed = PassthroughSubject<SocketStoryViewedData, Never>()
    public let storyReacted = PassthroughSubject<SocketStoryReactedData, Never>()
    public let statusCreated = PassthroughSubject<APIPost, Never>()
    public let statusDeleted = PassthroughSubject<String, Never>()
    public let statusUpdated = PassthroughSubject<APIPost, Never>()
    public let statusReacted = PassthroughSubject<SocketStatusReactedData, Never>()
    public let commentAdded = PassthroughSubject<SocketCommentAddedData, Never>()
    public let commentDeleted = PassthroughSubject<SocketCommentDeletedData, Never>()
    public let commentLiked = PassthroughSubject<SocketCommentLikedData, Never>()
    public let storyTranslationUpdated = PassthroughSubject<SocketStoryTranslationUpdatedData, Never>()
    public let postTranslationUpdated = PassthroughSubject<SocketPostTranslationUpdatedData, Never>()
    public let commentTranslationUpdated = PassthroughSubject<SocketCommentTranslationUpdatedData, Never>()

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()
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

    deinit {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    private init() {
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = SocialSocketManager.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = SocialSocketManager.isoFormatterBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
    }

    // MARK: - JWT Helpers

    private static func isJWTExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else { return true }
        return Date(timeIntervalSince1970: exp).addingTimeInterval(-30) < Date()
    }

    // MARK: - Connection

    public func connect() {
        guard socket == nil || socket?.status != .connected else { return }

        guard let token = APIClient.shared.authToken else {
            Logger.socket.warning("No auth token, skipping SocialSocket connect")
            return
        }

        let tokenExpired = Self.isJWTExpired(token)
        if tokenExpired {
            Logger.socket.warning("SocialSocket: JWT expired, triggering refresh instead of connecting")
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized()
            }
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

    public func disconnect() {
        stopHeartbeat()
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
        hadPreviousConnection = false
    }

    // MARK: - Background lifecycle

    /// Stops the heartbeat and tears down the socket explicitly so the
    /// resume path cannot be fooled by a stale `isConnected == true`
    /// flag. iOS suspension kills the WebSocket silently; without an
    /// explicit disconnect here, `resumeFromBackground()` would guard on
    /// the stale flag and never reconnect — the feed would stay dark.
    public func prepareForBackground() {
        stopHeartbeat()
        disconnect()
    }

    /// Called when the app comes back to `.active`. `prepareForBackground`
    /// already tore the socket down, so this is a plain reconnect.
    /// Reads the token from `APIClient` (nonisolated mirror of
    /// `AuthManager.authToken`) so lifecycle hooks can stay synchronous.
    public func resumeFromBackground() {
        guard APIClient.shared.authToken != nil else { return }
        forceReconnect()
    }

    /// Unconditionally rebuild the socket. Safe to call from any lifecycle
    /// hook — used to bypass the stale `isConnected` flag.
    public func forceReconnect() {
        disconnect()
        connect()
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

    // MARK: - Client Events

    public func subscribeFeed() {
        socket?.emit("feed:subscribe")
    }

    public func unsubscribeFeed() {
        socket?.emit("feed:unsubscribe")
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            self.reconnectAttempt = 0
            self.hadPreviousConnection = true
            DispatchQueue.main.async {
                self.isConnected = true
                self.connectionState = .connected
            }
            self.startHeartbeat()
            self.subscribeFeed()
            Logger.socket.info("SocialSocket connected")
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
            Logger.socket.info("SocialSocket disconnected")
        }

        socket.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            guard let self else { return }
            self.reconnectAttempt += 1
            let attempt = self.reconnectAttempt
            DispatchQueue.main.async {
                self.connectionState = .reconnecting(attempt: attempt)
            }
            Logger.socket.info("SocialSocket reconnect attempt \(attempt)")
        }

        socket.on(clientEvent: .error) { [weak self] data, _ in
            Logger.socket.error("SocialSocket error: \(data)")
            let errorStr = data.compactMap { "\($0)" }.joined(separator: " ")
            if errorStr.contains("token") || errorStr.contains("auth") || errorStr.contains("JWT") || errorStr.contains("expired") || errorStr.contains("401") {
                Logger.socket.warning("SocialSocket auth error — stopping reconnection")
                self?.manager?.reconnects = false
                self?.disconnect()
                Task { @MainActor in
                    AuthManager.shared.handleUnauthorized()
                }
            }
        }

        // --- Post events ---

        socket.on("post:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostCreatedData.self, from: data) { [weak self] payload in
                self?.postCreated.send(payload.post)
            }
        }

        socket.on("post:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostUpdatedData.self, from: data) { [weak self] payload in
                self?.postUpdated.send(payload.post)
            }
        }

        socket.on("post:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostDeletedData.self, from: data) { [weak self] payload in
                self?.postDeleted.send(payload.postId)
            }
        }

        socket.on("post:liked") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostLikedData.self, from: data) { [weak self] payload in
                self?.postLiked.send(payload)
            }
        }

        socket.on("post:unliked") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostUnlikedData.self, from: data) { [weak self] payload in
                self?.postUnliked.send(payload)
            }
        }

        socket.on("post:reposted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostRepostedData.self, from: data) { [weak self] payload in
                self?.postReposted.send(payload)
            }
        }

        socket.on("post:bookmarked") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostBookmarkedData.self, from: data) { [weak self] payload in
                self?.postBookmarked.send(payload)
            }
        }

        // --- Story events ---

        socket.on("story:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryCreatedData.self, from: data) { [weak self] payload in
                self?.storyCreated.send(payload.story)
            }
        }

        socket.on("story:viewed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryViewedData.self, from: data) { [weak self] payload in
                self?.storyViewed.send(payload)
            }
        }

        socket.on("story:reacted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryReactedData.self, from: data) { [weak self] payload in
                self?.storyReacted.send(payload)
            }
        }

        // --- Status events ---

        socket.on("status:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStatusCreatedData.self, from: data) { [weak self] payload in
                self?.statusCreated.send(payload.status)
            }
        }

        socket.on("status:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStatusDeletedData.self, from: data) { [weak self] payload in
                self?.statusDeleted.send(payload.statusId)
            }
        }

        socket.on("status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStatusCreatedData.self, from: data) { [weak self] payload in
                self?.statusUpdated.send(payload.status)
            }
        }

        socket.on("status:reacted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStatusReactedData.self, from: data) { [weak self] payload in
                self?.statusReacted.send(payload)
            }
        }

        // --- Comment events ---

        socket.on("comment:added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentAddedData.self, from: data) { [weak self] payload in
                self?.commentAdded.send(payload)
            }
        }

        socket.on("comment:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentDeletedData.self, from: data) { [weak self] payload in
                self?.commentDeleted.send(payload)
            }
        }

        socket.on("comment:liked") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentLikedData.self, from: data) { [weak self] payload in
                self?.commentLiked.send(payload)
            }
        }

        // --- Story translation events ---

        socket.on("post:story-translation-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryTranslationUpdatedData.self, from: data) { [weak self] payload in
                self?.storyTranslationUpdated.send(payload)
            }
        }

        // --- Post translation events ---

        socket.on("post:translation-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostTranslationUpdatedData.self, from: data) { [weak self] payload in
                self?.postTranslationUpdated.send(payload)
            }
        }

        socket.on("comment:translation-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentTranslationUpdatedData.self, from: data) { [weak self] payload in
                self?.commentTranslationUpdated.send(payload)
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
            Logger.socket.error("SocialSocket decode error for \(String(describing: type)): \(error)")
        }
    }
}
