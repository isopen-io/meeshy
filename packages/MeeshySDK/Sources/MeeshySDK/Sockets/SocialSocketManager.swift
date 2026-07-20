import Foundation
import SocketIO
import Combine
import os

// MARK: - Socket.IO Event Data Models

public struct SocketPostCreatedData: Decodable, Sendable {
    public let post: APIPost
    /// U1 — echoed from the createPost request's cmid so an offline author can
    /// reconcile its optimistic temp post (id == cmid) with this server post
    /// instead of rendering a duplicate. Absent for posts created without a cmid.
    public let clientMutationId: String?

    public init(post: APIPost, clientMutationId: String?) {
        self.post = post
        self.clientMutationId = clientMutationId
    }
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

public struct SocketStoryUpdatedData: Decodable, Sendable {
    public let story: APIPost
}

public struct SocketStoryDeletedData: Decodable, Sendable {
    public let storyId: String
    public let authorId: String
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

public struct SocketStoryUnreactedData: Decodable, Sendable {
    public let storyId: String
    public let userId: String
    public let emoji: String
    public init(storyId: String, userId: String, emoji: String) {
        self.storyId = storyId
        self.userId = userId
        self.emoji = emoji
    }
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

public struct SocketStatusUnreactedData: Decodable, Sendable {
    public let statusId: String
    public let userId: String
    public let emoji: String
    public init(statusId: String, userId: String, emoji: String) {
        self.statusId = statusId
        self.userId = userId
        self.emoji = emoji
    }
}

public struct SocketConversationDeletedData: Decodable, Sendable {
    public let conversationId: String
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

public struct SocketCommentReactionAggregation: Codable, Sendable {
    public let emoji: String
    public let count: Int
    public let userIds: [String]
    public let hasCurrentUser: Bool
}

public struct SocketCommentReactionUpdateEvent: Codable, Sendable {
    public let commentId: String
    public let postId: String
    public let userId: String
    public let emoji: String
    public let action: String
    public let aggregation: SocketCommentReactionAggregation
    public let timestamp: Date?
}

public struct SocketCommentReactionSyncEvent: Codable, Sendable {
    public let commentId: String
    // postId is required so a sync (request-sync ACK) can locate the comment in
    // a post-scoped cache — the gateway's getCommentReactions returns it and the
    // shared CommentReactionSyncEventData declares it required. Without it iOS
    // could not key the comment to its post.
    public let postId: String
    public let reactions: [SocketCommentReactionAggregation]
    public let totalCount: Int
    public let userReactions: [String]
}

public struct SocketPostBookmarkedData: Decodable, Sendable {
    public let postId: String
    public let bookmarked: Bool
    /// Absolute bookmark count after the mutation (mirrors `likeCount` on the
    /// like events). Optional so decoding survives an older gateway that does
    /// not yet emit it — clients then leave the displayed count untouched.
    public let bookmarkCount: Int?
}

public struct SocketPostReactionAggregation: Codable, Sendable {
    public let emoji: String
    public let count: Int
}

public struct SocketPostReactionUpdateEvent: Codable, Sendable {
    public let postId: String
    public let userId: String
    public let emoji: String
    public let action: String
    public let aggregation: SocketPostReactionAggregation
    public let timestamp: Date?
}

public struct SocketPostReactionSyncEvent: Codable, Sendable {
    public let postId: String
    public let reactions: [SocketPostReactionAggregation]
    public let totalCount: Int
    public let userReactions: [String]
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

/// `comment:media-updated` — émis quand le pipeline audio d'un média de commentaire
/// a produit une transcription/traductions. Porte le commentaire enrichi (média
/// transcrit/traduit) à substituer en cache.
public struct SocketCommentMediaUpdatedData: Decodable, Sendable {
    public let postId: String
    public let commentId: String
    public let comment: APIPostComment
}

// MARK: - Protocol

public protocol SocialSocketProviding: Sendable {
    var postCreated: PassthroughSubject<SocketPostCreatedData, Never> { get }
    var postUpdated: PassthroughSubject<APIPost, Never> { get }
    var postDeleted: PassthroughSubject<String, Never> { get }
    var postLiked: PassthroughSubject<SocketPostLikedData, Never> { get }
    var postUnliked: PassthroughSubject<SocketPostUnlikedData, Never> { get }
    var postReposted: PassthroughSubject<SocketPostRepostedData, Never> { get }
    var postBookmarked: PassthroughSubject<SocketPostBookmarkedData, Never> { get }
    var storyCreated: PassthroughSubject<APIPost, Never> { get }
    var storyUpdated: PassthroughSubject<SocketStoryUpdatedData, Never> { get }
    var storyDeleted: PassthroughSubject<SocketStoryDeletedData, Never> { get }
    var storyViewed: PassthroughSubject<SocketStoryViewedData, Never> { get }
    var storyReacted: PassthroughSubject<SocketStoryReactedData, Never> { get }
    var storyUnreacted: PassthroughSubject<SocketStoryUnreactedData, Never> { get }
    var statusCreated: PassthroughSubject<APIPost, Never> { get }
    var statusDeleted: PassthroughSubject<String, Never> { get }
    var statusUpdated: PassthroughSubject<APIPost, Never> { get }
    var statusReacted: PassthroughSubject<SocketStatusReactedData, Never> { get }
    var statusUnreacted: PassthroughSubject<SocketStatusUnreactedData, Never> { get }
    var conversationDeleted: PassthroughSubject<String, Never> { get }
    var commentAdded: PassthroughSubject<SocketCommentAddedData, Never> { get }
    var commentDeleted: PassthroughSubject<SocketCommentDeletedData, Never> { get }
    var commentLiked: PassthroughSubject<SocketCommentLikedData, Never> { get }
    var commentReactionAdded: PassthroughSubject<SocketCommentReactionUpdateEvent, Never> { get }
    var commentReactionRemoved: PassthroughSubject<SocketCommentReactionUpdateEvent, Never> { get }
    var commentReactionSync: PassthroughSubject<SocketCommentReactionSyncEvent, Never> { get }
    var postReactionAdded: PassthroughSubject<SocketPostReactionUpdateEvent, Never> { get }
    var postReactionRemoved: PassthroughSubject<SocketPostReactionUpdateEvent, Never> { get }
    var postReactionSync: PassthroughSubject<SocketPostReactionSyncEvent, Never> { get }
    var storyTranslationUpdated: PassthroughSubject<SocketStoryTranslationUpdatedData, Never> { get }
    var postTranslationUpdated: PassthroughSubject<SocketPostTranslationUpdatedData, Never> { get }
    var commentTranslationUpdated: PassthroughSubject<SocketCommentTranslationUpdatedData, Never> { get }
    var commentMediaUpdated: PassthroughSubject<SocketCommentMediaUpdatedData, Never> { get }
    /// Fires on every reconnect (a `.connect` that follows a previous one).
    /// App-side feed handlers (FeedViewModel) observe this to backfill posts /
    /// reactions missed while the social socket was down.
    var didReconnect: PassthroughSubject<Void, Never> { get }
    var isConnected: Bool { get }
    var connectionState: ConnectionState { get }
    func connect()
    func disconnect()
    func subscribeFeed()
    func unsubscribeFeed()
    func joinPostRoom(postId: String)
    func leavePostRoom(postId: String)
    func addCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent
    func removeCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent
    func requestCommentReactionSync(commentId: String) async throws -> SocketCommentReactionSyncEvent
    func addPostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent
    func removePostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent
    func requestPostReactionSync(postId: String) async throws -> SocketPostReactionSyncEvent
}

// MARK: - Social Socket Manager

public final class SocialSocketManager: ObservableObject, SocialSocketProviding, @unchecked Sendable {
    public static let shared = SocialSocketManager()

    // Combine publishers for ViewModels to subscribe to
    public let postCreated = PassthroughSubject<SocketPostCreatedData, Never>()
    public let postUpdated = PassthroughSubject<APIPost, Never>()
    public let postDeleted = PassthroughSubject<String, Never>()
    public let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    public let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    public let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
    public let postBookmarked = PassthroughSubject<SocketPostBookmarkedData, Never>()
    public let storyCreated = PassthroughSubject<APIPost, Never>()
    public let storyUpdated = PassthroughSubject<SocketStoryUpdatedData, Never>()
    public let storyDeleted = PassthroughSubject<SocketStoryDeletedData, Never>()
    public let storyViewed = PassthroughSubject<SocketStoryViewedData, Never>()
    public let storyReacted = PassthroughSubject<SocketStoryReactedData, Never>()
    public let storyUnreacted = PassthroughSubject<SocketStoryUnreactedData, Never>()
    public let statusCreated = PassthroughSubject<APIPost, Never>()
    public let statusDeleted = PassthroughSubject<String, Never>()
    public let statusUpdated = PassthroughSubject<APIPost, Never>()
    public let statusReacted = PassthroughSubject<SocketStatusReactedData, Never>()
    public let statusUnreacted = PassthroughSubject<SocketStatusUnreactedData, Never>()
    public let conversationDeleted = PassthroughSubject<String, Never>()
    public let commentAdded = PassthroughSubject<SocketCommentAddedData, Never>()
    public let commentDeleted = PassthroughSubject<SocketCommentDeletedData, Never>()
    public let commentLiked = PassthroughSubject<SocketCommentLikedData, Never>()
    public let commentReactionAdded = PassthroughSubject<SocketCommentReactionUpdateEvent, Never>()
    public let commentReactionRemoved = PassthroughSubject<SocketCommentReactionUpdateEvent, Never>()
    public let commentReactionSync = PassthroughSubject<SocketCommentReactionSyncEvent, Never>()
    public let postReactionAdded = PassthroughSubject<SocketPostReactionUpdateEvent, Never>()
    public let postReactionRemoved = PassthroughSubject<SocketPostReactionUpdateEvent, Never>()
    public let postReactionSync = PassthroughSubject<SocketPostReactionSyncEvent, Never>()
    public let storyTranslationUpdated = PassthroughSubject<SocketStoryTranslationUpdatedData, Never>()
    public let postTranslationUpdated = PassthroughSubject<SocketPostTranslationUpdatedData, Never>()
    public let commentTranslationUpdated = PassthroughSubject<SocketCommentTranslationUpdatedData, Never>()
    public let commentMediaUpdated = PassthroughSubject<SocketCommentMediaUpdatedData, Never>()

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()
    private var reconnectAttempt: Int = 0
    private var hadPreviousConnection = false
    /// Post rooms actuellement rejointes (détail, reel, story, commentaires).
    /// Miroir de `MessageSocketManager.joinedConversations` : après une reconnexion
    /// (résumé d'app / réseau revenu), le gateway a oublié nos rooms — sans re-join
    /// les likes/commentaires/réactions temps réel du post ouvert cessaient
    /// silencieusement. Préservé à travers `suspendTransport`, vidé au `disconnect()`.
    private var joinedPostRooms: Set<String> = []
    /// Fires on every reconnect (a `.connect` that follows a previous one).
    /// R2 — feed re-sync trigger; FeedViewModel observes this to backfill
    /// posts/reactions missed while the social socket was down.
    public let didReconnect = PassthroughSubject<Void, Never>()
    private var heartbeatTimer: Timer?
    private var lifecycleCancellables = Set<AnyCancellable>()

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
        observeNetworkRecovery()
    }

    /// Source unique de vérité réseau : quand `NetworkMonitor` repasse en
    /// ligne, forcer une reconnexion socket immédiate. Évite la persistance
    /// de la bannière "Reconnexion..." pendant la boucle de retry interne
    /// de Socket.IO après une coupure prolongée.
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
        Logger.socket.info("SocialSocket: network back online → forcing reconnect")
        forceReconnect()
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
        // Ne JAMAIS reconstruire le socket tant qu'une connexion existe ou est
        // en cours : réassigner `manager`/`socket` relâche l'instance courante
        // en plein handshake et la connexion n'aboutit jamais.
        if let socket, socket.status == .connected || socket.status == .connecting {
            return
        }

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
            // CALL-FIX 2026-06-06 — WebSocket transport (voir MessageSocketManager).
            .extraHeaders(["Authorization": "Bearer \(token)"]),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    /// Transport-only teardown (R1 — sibling of MessageSocketManager.suspendTransport).
    /// Drops the socket + heartbeat so a stale `isConnected == true` cannot fool
    /// the resume path, but PRESERVES `hadPreviousConnection` so the next
    /// `.connect` is recognised as a reconnect (fires `didReconnect` → feed/social
    /// re-sync). Contrast `disconnect()` (logout/cold reset) which also clears it.
    private func suspendTransport() {
        stopHeartbeat()
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
    }

    public func disconnect() {
        suspendTransport()
        // Logout / cold reset: forget the prior connection so the next `.connect`
        // is a genuine cold first connect (no spurious reconnect backfill).
        hadPreviousConnection = false
        // Cold reset : oublier les post rooms (contrairement à suspendTransport qui
        // les préserve pour le re-join au resume).
        joinedPostRooms.removeAll()
    }

    // MARK: - Background lifecycle

    /// Stops the heartbeat and tears down the socket explicitly so the
    /// resume path cannot be fooled by a stale `isConnected == true`
    /// flag. iOS suspension kills the WebSocket silently; without an
    /// explicit teardown here, `resumeFromBackground()` would guard on
    /// the stale flag and never reconnect — the feed would stay dark.
    /// R1 — transport-only suspend KEEPS `hadPreviousConnection` so the
    /// foreground-resume `.connect` fires `didReconnect`.
    public func prepareForBackground() {
        suspendTransport()
    }

    /// Called when the app comes back to `.active`. `prepareForBackground`
    /// already tore the socket down, so this is a plain reconnect.
    /// Reads the token from `APIClient` (nonisolated mirror of
    /// `AuthManager.authToken`) so lifecycle hooks can stay synchronous.
    public func resumeFromBackground() {
        guard APIClient.shared.authToken != nil else { return }
        forceReconnect()
    }

    /// CALL-FIX 2026-06-05 — app-injected "is a call active?" predicate (opaque
    /// closure, SDK stays call-agnostic). When true, forceReconnect is suppressed
    /// so a token rotation / re-auth never tears down the socket mid-call.
    public var isCallActiveGuard: (@Sendable () -> Bool)?

    /// Unconditionally rebuild the socket. Safe to call from any lifecycle
    /// hook — used to bypass the stale `isConnected` flag. R1 — suspends the
    /// transport (not a full disconnect) so `hadPreviousConnection` survives
    /// the rebuild and the next `.connect` fires `didReconnect`.
    public func forceReconnect() {
        if isCallActiveGuard?() == true {
            Logger.socket.info("SocialSocket: forceReconnect suppressed — call active (keep signaling socket)")
            return
        }
        suspendTransport()
        connect()
    }

    /// Connection-handshake bookkeeping, extracted from the `.connect` handler
    /// so the reconnect-vs-cold decision is unit-testable without a live socket
    /// (R1/R2 — mirror of MessageSocketManager.handleConnectionEstablished).
    /// Fires `didReconnect` when this connection follows a previous one
    /// (network blip / foreground resume / re-auth) so feed + social state is
    /// re-synced. Returns whether it was a reconnect.
    @discardableResult
    func handleConnectionEstablished() -> Bool {
        let wasReconnect = hadPreviousConnection
        hadPreviousConnection = true
        reconnectAttempt = 0
        if wasReconnect {
            DispatchQueue.main.async { [weak self] in self?.didReconnect.send(()) }
        }
        return wasReconnect
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

    // MARK: - Post Room Management

    public func joinPostRoom(postId: String) {
        // Tracker AVANT toute émission : le handler `.connect` re-émet `post:join`
        // pour toutes les rooms de `joinedPostRooms` une fois le handshake terminé.
        joinedPostRooms.insert(postId)
        guard socket?.status == .connected else {
            // Socket pas encore connecté : émettre serait perdu. Le re-join du
            // handler `.connect` prendra le relais (miroir de joinConversation).
            return
        }
        socket?.emit("post:join", ["postId": postId])
        Logger.socket.info("SocialSocket joined post room: \(postId)")
    }

    public func leavePostRoom(postId: String) {
        joinedPostRooms.remove(postId)
        socket?.emit("post:leave", ["postId": postId])
        Logger.socket.info("SocialSocket left post room: \(postId)")
    }

    /// Rooms à re-joindre après un (re)connect, ordre déterministe pour les tests.
    func postRoomsToRejoinOnConnect() -> [String] {
        joinedPostRooms.sorted()
    }

    // MARK: - Comment Reaction Emission

    public enum CommentReactionError: Error, Sendable, LocalizedError {
        case noSocket
        case timeout
        case serverError(String)
        case malformedResponse

        public var errorDescription: String? {
            switch self {
            case .noSocket: return "noSocket — SocialSocket not connected"
            case .timeout: return "timeout — Gateway did not respond within 10s"
            case .serverError(let message): return "serverError — \(message)"
            case .malformedResponse: return "malformedResponse — Unexpected ACK format"
            }
        }
    }

    public func addCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent {
        guard let socket else { throw CommentReactionError.noSocket }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("comment:reaction-add", ["commentId": commentId, "postId": postId, "emoji": emoji]).timingOut(after: 10) { items in
                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: CommentReactionError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any] else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: CommentReactionError.serverError(message))
                    return
                }
                continuation.resume(returning: Self.decodeCommentReactionAck(data, decoder: self.decoder, commentId: commentId, postId: postId, emoji: emoji, action: "add"))
            }
        }
    }

    public func removeCommentReaction(commentId: String, postId: String, emoji: String) async throws -> SocketCommentReactionUpdateEvent {
        guard let socket else { throw CommentReactionError.noSocket }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("comment:reaction-remove", ["commentId": commentId, "postId": postId, "emoji": emoji]).timingOut(after: 10) { items in
                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: CommentReactionError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any] else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: CommentReactionError.serverError(message))
                    return
                }
                continuation.resume(returning: Self.decodeCommentReactionAck(data, decoder: self.decoder, commentId: commentId, postId: postId, emoji: emoji, action: "remove"))
            }
        }
    }

    public func requestCommentReactionSync(commentId: String) async throws -> SocketCommentReactionSyncEvent {
        guard let socket else { throw CommentReactionError.noSocket }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("comment:reaction-request-sync", ["commentId": commentId]).timingOut(after: 10) { items in
                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: CommentReactionError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any] else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: CommentReactionError.serverError(message))
                    return
                }
                guard let jsonData = try? JSONSerialization.data(withJSONObject: data),
                      let event = try? self.decoder.decode(SocketCommentReactionSyncEvent.self, from: jsonData) else {
                    continuation.resume(throwing: CommentReactionError.malformedResponse)
                    return
                }
                continuation.resume(returning: event)
            }
        }
    }

    // MARK: - Post Reaction Emission

    public enum PostReactionError: Error, Sendable, LocalizedError {
        case noSocket
        case timeout
        case serverError(String)
        case malformedResponse

        public var errorDescription: String? {
            switch self {
            case .noSocket: return "noSocket — SocialSocket not connected"
            case .timeout: return "timeout — Gateway did not respond within 10s"
            case .serverError(let message): return "serverError — \(message)"
            case .malformedResponse: return "malformedResponse — Unexpected ACK format"
            }
        }
    }

    /// Décode l'ACK d'une réaction post. Contrat aligné (gateway `PostReactionHandler`) :
    /// `data` == l'`updateEvent` du broadcast `post:reaction-added/-removed`.
    /// TOLÉRANT : si le shape de l'ACK dérive (success==true mais champs inattendus), on
    /// synthétise un événement minimal au lieu de jeter `malformedResponse` — l'agrégation
    /// autoritaire arrive via le broadcast et tous les appelants ignorent ce retour
    /// (`_ = try await …`). Évite l'ancien bug où chaque réaction socket échouait.
    nonisolated static func decodePostReactionAck(
        _ data: [String: Any], decoder: JSONDecoder, postId: String, emoji: String, action: String
    ) -> SocketPostReactionUpdateEvent {
        if let jsonData = try? JSONSerialization.data(withJSONObject: data),
           let event = try? decoder.decode(SocketPostReactionUpdateEvent.self, from: jsonData) {
            return event
        }
        return SocketPostReactionUpdateEvent(
            postId: postId, userId: "", emoji: emoji, action: action,
            aggregation: SocketPostReactionAggregation(emoji: emoji, count: 0), timestamp: nil)
    }

    /// Décode l'ACK d'une réaction commentaire (même contrat/tolérance que `decodePostReactionAck`).
    nonisolated static func decodeCommentReactionAck(
        _ data: [String: Any], decoder: JSONDecoder, commentId: String, postId: String, emoji: String, action: String
    ) -> SocketCommentReactionUpdateEvent {
        if let jsonData = try? JSONSerialization.data(withJSONObject: data),
           let event = try? decoder.decode(SocketCommentReactionUpdateEvent.self, from: jsonData) {
            return event
        }
        return SocketCommentReactionUpdateEvent(
            commentId: commentId, postId: postId, userId: "", emoji: emoji, action: action,
            aggregation: SocketCommentReactionAggregation(emoji: emoji, count: 0, userIds: [], hasCurrentUser: false),
            timestamp: nil)
    }

    public func addPostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent {
        guard let socket else { throw PostReactionError.noSocket }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("post:reaction-add", ["postId": postId, "emoji": emoji]).timingOut(after: 10) { items in
                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: PostReactionError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any] else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: PostReactionError.serverError(message))
                    return
                }
                continuation.resume(returning: Self.decodePostReactionAck(data, decoder: self.decoder, postId: postId, emoji: emoji, action: "add"))
            }
        }
    }

    public func removePostReaction(postId: String, emoji: String) async throws -> SocketPostReactionUpdateEvent {
        guard let socket else { throw PostReactionError.noSocket }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("post:reaction-remove", ["postId": postId, "emoji": emoji]).timingOut(after: 10) { items in
                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: PostReactionError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any] else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: PostReactionError.serverError(message))
                    return
                }
                continuation.resume(returning: Self.decodePostReactionAck(data, decoder: self.decoder, postId: postId, emoji: emoji, action: "remove"))
            }
        }
    }

    public func requestPostReactionSync(postId: String) async throws -> SocketPostReactionSyncEvent {
        guard let socket else { throw PostReactionError.noSocket }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("post:reaction-request-sync", ["postId": postId]).timingOut(after: 10) { items in
                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: PostReactionError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any] else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: PostReactionError.serverError(message))
                    return
                }
                guard let jsonData = try? JSONSerialization.data(withJSONObject: data),
                      let event = try? self.decoder.decode(SocketPostReactionSyncEvent.self, from: jsonData) else {
                    continuation.resume(throwing: PostReactionError.malformedResponse)
                    return
                }
                continuation.resume(returning: event)
            }
        }
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            // R1/R2 — records the connection and fires `didReconnect` when this
            // follows a previous connection (resume / network-back / re-auth).
            self.handleConnectionEstablished()
            DispatchQueue.main.async {
                self.isConnected = true
                self.connectionState = .connected
            }
            self.startHeartbeat()
            self.subscribeFeed()
            // Re-join des post rooms après (re)connexion : le gateway a oublié nos
            // rooms à la coupure. Sans ça, le post/reel/story ouvert cessait de
            // recevoir likes/commentaires/réactions temps réel après un flap réseau.
            let rooms = self.postRoomsToRejoinOnConnect()
            for postId in rooms {
                self.socket?.emit("post:join", ["postId": postId])
            }
            if !rooms.isEmpty {
                Logger.socket.info("SocialSocket reconnected — re-joined \(rooms.count) post room(s)")
            }
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

        socket.on(clientEvent: .error) { data, _ in
            // Log but NEVER force a logout from a socket error. Loose string
            // matching on error payloads produced false positives that kicked
            // the user out on transient failures. Socket.IO's built-in
            // reconnect loop will retry; only APIClient 401 can trigger a
            // silent token refresh, and even that preserves the session.
            Logger.socket.error("SocialSocket error: \(data)")
        }

        // --- Post events ---

        socket.on("post:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostCreatedData.self, from: data) { [weak self] payload in
                self?.postCreated.send(payload)
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

        socket.on("story:unreacted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryUnreactedData.self, from: data) { [weak self] payload in
                self?.storyUnreacted.send(payload)
            }
        }

        socket.on("story:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryUpdatedData.self, from: data) { [weak self] payload in
                self?.storyUpdated.send(payload)
            }
        }

        socket.on("story:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStoryDeletedData.self, from: data) { [weak self] payload in
                self?.storyDeleted.send(payload)
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

        socket.on("status:unreacted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketStatusUnreactedData.self, from: data) { [weak self] payload in
                self?.statusUnreacted.send(payload)
            }
        }

        // --- Conversation events ---
        // Surfaced on the social manager (in addition to MessageSocketManager)
        // so feature-level coordinators that don't own a message socket can
        // still react to a conversation being deleted server-side.
        //
        // B6 — The gateway emits the **`conversation:closed`** event when a
        // conversation is "deleted" (soft-delete via `isActive=false +
        // closedAt`; cf. `services/gateway/src/routes/conversations/core.ts`).
        // The historical `conversation:deleted` listener stayed wired in
        // case a future hard-delete code path emits it, but the actual
        // server traffic is `conversation:closed` — both fan into the
        // same `conversationDeleted` publisher so downstream consumers
        // (audio coordinator, list view models) don't need to care which
        // event the backend emitted.

        let conversationLifecycleHandler: ([Any]) -> Void = { [weak self] data in
            guard let self else { return }
            self.decode(SocketConversationDeletedData.self, from: data) { [weak self] payload in
                self?.conversationDeleted.send(payload.conversationId)
            }
        }
        socket.on("conversation:deleted") { data, _ in conversationLifecycleHandler(data) }
        socket.on("conversation:closed") { data, _ in conversationLifecycleHandler(data) }

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

        socket.on("comment:reaction-added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentReactionUpdateEvent.self, from: data) { [weak self] payload in
                self?.commentReactionAdded.send(payload)
            }
        }

        socket.on("comment:reaction-removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentReactionUpdateEvent.self, from: data) { [weak self] payload in
                self?.commentReactionRemoved.send(payload)
            }
        }

        // NOTE: there is no `socket.on("comment:reaction-sync")` — the gateway
        // never broadcasts that event; comment reaction sync data is returned via
        // the `comment:reaction-request-sync` ACK (see requestCommentReactionSync).

        socket.on("post:reaction-added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostReactionUpdateEvent.self, from: data) { [weak self] payload in
                self?.postReactionAdded.send(payload)
            }
        }

        socket.on("post:reaction-removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketPostReactionUpdateEvent.self, from: data) { [weak self] payload in
                self?.postReactionRemoved.send(payload)
            }
        }

        // NOTE: there is no `socket.on("post:reaction-sync")` — the gateway never
        // broadcasts that event; post reaction sync data is returned via the
        // `post:reaction-request-sync` ACK (see requestPostReactionSync).

        // --- Story translation events ---

        // Source de vérité : `packages/shared/types/socketio-events.ts` →
        // `STORY_TRANSLATION_UPDATED: 'story:translation-updated'`. L'ancien nom
        // `post:story-translation-updated` (en place jusqu'au 2026-06-01) ne
        // correspondait plus à l'event émis par le gateway
        // (`StoryTextObjectTranslationService`) → les traductions de story temps
        // réel n'atteignaient jamais le client.
        socket.on("story:translation-updated") { [weak self] data, _ in
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

        socket.on("comment:media-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketCommentMediaUpdatedData.self, from: data) { [weak self] payload in
                self?.commentMediaUpdated.send(payload)
            }
        }

        // NOTE — `notification:new` in-app toasts are handled via
        // MessageSocketManager.notificationReceived → NotificationToastManager.
        // SocialSocketManager intentionally does NOT mirror that event (a second
        // decode with no consumer would be dead work + a double-toast hazard).
    }

    // MARK: - Decode Helper

    #if DEBUG
    /// Test seam (DEBUG only): drives the same decode + publisher fan-out
    /// that the production `conversation:closed` / `conversation:deleted`
    /// listeners use, without requiring a live Socket.IO connection. Tests
    /// pass the raw payload (e.g. `[["conversationId": "c1"]]`) to assert
    /// that `conversationDeleted` publishes — covering B6's hook from the
    /// gateway-side event name.
    nonisolated func _test_handleConversationLifecyclePayload(_ data: [Any]) {
        self.decode(SocketConversationDeletedData.self, from: data) { [weak self] payload in
            self?.conversationDeleted.send(payload.conversationId)
        }
    }
    #endif

    /// Serial queue + dedicated decoder so social realtime payloads parse off the
    /// main thread. Socket.IO's handle queue defaults to main, so decoding inline
    /// ran every post / story / status event's JSON on the main thread. The serial
    /// queue preserves arrival order; the handler still lands on main. (The small
    /// reaction handlers keep using `decoder` on main — separate instance, no
    /// cross-queue sharing.)
    private static let offMainDecoder = JSONDecoder()
    private static let decodeQueue = DispatchQueue(label: "me.meeshy.social-socket.decode", qos: .userInitiated)

    private nonisolated func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @Sendable (T) -> Void) {
        guard let first = data.first else { return }

        let jsonData: Data
        if let dict = first as? [String: Any] {
            guard let serialized = try? JSONSerialization.data(withJSONObject: dict) else { return }
            jsonData = serialized
        } else if let str = first as? String {
            jsonData = Data(str.utf8)
        } else {
            return
        }

        Self.decodeQueue.async {
            do {
                let decoded = try Self.offMainDecoder.decode(type, from: jsonData)
                DispatchQueue.main.async { handler(decoded) }
            } catch {
                Logger.socket.error("SocialSocket decode error for \(String(describing: type)): \(error)")
            }
        }
    }
}
