import Foundation
import SocketIO
import Combine
import os

// MARK: - Socket.IO Event Data Models

public struct SocketPostCreatedData: Decodable {
    public let post: APIPost
}

public struct SocketPostUpdatedData: Decodable {
    public let post: APIPost
}

public struct SocketPostDeletedData: Decodable {
    public let postId: String
    public let authorId: String
}

public struct SocketPostLikedData: Decodable {
    public let postId: String
    public let userId: String
    public let emoji: String
    public let likeCount: Int
    public let reactionSummary: [String: Int]
}

public struct SocketPostUnlikedData: Decodable {
    public let postId: String
    public let userId: String
    public let likeCount: Int
    public let reactionSummary: [String: Int]
}

public struct SocketPostRepostedData: Decodable {
    public let originalPostId: String
    public let repost: APIPost
}

public struct SocketStoryCreatedData: Decodable {
    public let story: APIPost
}

public struct SocketStoryViewedData: Decodable {
    public let storyId: String
    public let viewerId: String
    public let viewerUsername: String
    public let viewCount: Int
}

public struct SocketStoryReactedData: Decodable {
    public let storyId: String
    public let userId: String
    public let emoji: String
}

public struct SocketStatusCreatedData: Decodable {
    public let status: APIPost
}

public struct SocketStatusDeletedData: Decodable {
    public let statusId: String
    public let authorId: String
}

public struct SocketStatusReactedData: Decodable {
    public let statusId: String
    public let userId: String
    public let emoji: String
}

public struct SocketCommentAddedData: Decodable {
    public let postId: String
    public let comment: APIPostComment
    public let commentCount: Int
}

public struct SocketCommentDeletedData: Decodable {
    public let postId: String
    public let commentId: String
    public let commentCount: Int
}

public struct SocketCommentLikedData: Decodable {
    public let postId: String
    public let commentId: String
    public let userId: String
    public let likeCount: Int
}

public struct SocketStoryTranslationUpdatedData: Decodable {
    public let postId: String
    public let textObjectIndex: Int
    public let translations: [String: String]
}

// MARK: - Social Socket Manager

public final class SocialSocketManager: ObservableObject {
    public static let shared = SocialSocketManager()

    // Combine publishers for ViewModels to subscribe to
    public let postCreated = PassthroughSubject<APIPost, Never>()
    public let postUpdated = PassthroughSubject<APIPost, Never>()
    public let postDeleted = PassthroughSubject<String, Never>()
    public let postLiked = PassthroughSubject<SocketPostLikedData, Never>()
    public let postUnliked = PassthroughSubject<SocketPostUnlikedData, Never>()
    public let postReposted = PassthroughSubject<SocketPostRepostedData, Never>()
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

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private let decoder = JSONDecoder()
    private var reconnectAttempt: Int = 0
    private var hadPreviousConnection = false

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
            Logger.socket.warning("No auth token, skipping SocialSocket connect")
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
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
        hadPreviousConnection = false
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
            self.subscribeFeed()
            Logger.socket.info("SocialSocket connected")
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = false
                if self?.hadPreviousConnection == true {
                    self?.connectionState = .reconnecting(attempt: 0)
                } else {
                    self?.connectionState = .disconnected
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

        socket.on(clientEvent: .error) { _, args in
            Logger.socket.error("SocialSocket error: \(args)")
        }

        // --- Post events ---

        socket.on("post:created") { [weak self] data, _ in
            self?.decode(SocketPostCreatedData.self, from: data) { payload in
                self?.postCreated.send(payload.post)
            }
        }

        socket.on("post:updated") { [weak self] data, _ in
            self?.decode(SocketPostUpdatedData.self, from: data) { payload in
                self?.postUpdated.send(payload.post)
            }
        }

        socket.on("post:deleted") { [weak self] data, _ in
            self?.decode(SocketPostDeletedData.self, from: data) { payload in
                self?.postDeleted.send(payload.postId)
            }
        }

        socket.on("post:liked") { [weak self] data, _ in
            self?.decode(SocketPostLikedData.self, from: data) { payload in
                self?.postLiked.send(payload)
            }
        }

        socket.on("post:unliked") { [weak self] data, _ in
            self?.decode(SocketPostUnlikedData.self, from: data) { payload in
                self?.postUnliked.send(payload)
            }
        }

        socket.on("post:reposted") { [weak self] data, _ in
            self?.decode(SocketPostRepostedData.self, from: data) { payload in
                self?.postReposted.send(payload)
            }
        }

        // --- Story events ---

        socket.on("story:created") { [weak self] data, _ in
            self?.decode(SocketStoryCreatedData.self, from: data) { payload in
                self?.storyCreated.send(payload.story)
            }
        }

        socket.on("story:viewed") { [weak self] data, _ in
            self?.decode(SocketStoryViewedData.self, from: data) { payload in
                self?.storyViewed.send(payload)
            }
        }

        socket.on("story:reacted") { [weak self] data, _ in
            self?.decode(SocketStoryReactedData.self, from: data) { payload in
                self?.storyReacted.send(payload)
            }
        }

        // --- Status events ---

        socket.on("status:created") { [weak self] data, _ in
            self?.decode(SocketStatusCreatedData.self, from: data) { payload in
                self?.statusCreated.send(payload.status)
            }
        }

        socket.on("status:deleted") { [weak self] data, _ in
            self?.decode(SocketStatusDeletedData.self, from: data) { payload in
                self?.statusDeleted.send(payload.statusId)
            }
        }

        socket.on("status:updated") { [weak self] data, _ in
            self?.decode(SocketStatusCreatedData.self, from: data) { payload in
                self?.statusUpdated.send(payload.status)
            }
        }

        socket.on("status:reacted") { [weak self] data, _ in
            self?.decode(SocketStatusReactedData.self, from: data) { payload in
                self?.statusReacted.send(payload)
            }
        }

        // --- Comment events ---

        socket.on("comment:added") { [weak self] data, _ in
            self?.decode(SocketCommentAddedData.self, from: data) { payload in
                self?.commentAdded.send(payload)
            }
        }

        socket.on("comment:deleted") { [weak self] data, _ in
            self?.decode(SocketCommentDeletedData.self, from: data) { payload in
                self?.commentDeleted.send(payload)
            }
        }

        socket.on("comment:liked") { [weak self] data, _ in
            self?.decode(SocketCommentLikedData.self, from: data) { payload in
                self?.commentLiked.send(payload)
            }
        }

        // --- Story translation events ---

        socket.on("post:story-translation-updated") { [weak self] data, _ in
            self?.decode(SocketStoryTranslationUpdatedData.self, from: data) { payload in
                self?.storyTranslationUpdated.send(payload)
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
            Logger.socket.error("SocialSocket decode error for \(String(describing: type)): \(error)")
        }
    }
}
