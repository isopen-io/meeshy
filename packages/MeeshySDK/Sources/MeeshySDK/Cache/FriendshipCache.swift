import Foundation
import Combine
import os

public enum FriendshipStatus: Sendable, Equatable {
    case friend
    case pendingSent(requestId: String)
    case pendingReceived(requestId: String)
    case none
}

public final class FriendshipCache: ObservableObject, @unchecked Sendable {
    public static let shared = FriendshipCache()

    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "friendship-cache")
    private let lock = NSLock()

    private var _friendIds: Set<String> = []
    private var _sentPending: [String: String] = [:]      // receiverId -> requestId
    private var _receivedPending: [String: String] = [:]   // senderId -> requestId
    private var _isHydrated = false

    public var isHydrated: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isHydrated
    }

    public var friendIds: Set<String> {
        lock.lock()
        defer { lock.unlock() }
        return _friendIds
    }

    public var friendCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return _friendIds.count
    }

    public var pendingReceivedCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return _receivedPending.count
    }

    private init() {}

    // MARK: - Lookup

    public func status(for userId: String) -> FriendshipStatus {
        lock.lock()
        defer { lock.unlock() }
        if _friendIds.contains(userId) { return .friend }
        if let requestId = _sentPending[userId] { return .pendingSent(requestId: requestId) }
        if let requestId = _receivedPending[userId] { return .pendingReceived(requestId: requestId) }
        return .none
    }

    public func isFriend(_ userId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return _friendIds.contains(userId)
    }

    // MARK: - Hydrate (call once after login)

    public func hydrate(friendService: FriendServiceProviding = FriendService.shared) async {
        logger.info("Hydrating friendship cache...")

        do {
            // Fetch sent and received requests in parallel
            async let sentTask = Self.fetchAllPages { offset, limit in
                try await friendService.sentRequests(offset: offset, limit: limit)
            }
            async let receivedTask = Self.fetchAllPages { offset, limit in
                try await friendService.receivedRequests(offset: offset, limit: limit)
            }

            let (allSent, allReceived) = try await (sentTask, receivedTask)
            applyHydration(sent: allSent, received: allReceived)
        } catch {
            logger.error("Failed to hydrate friendship cache: \(error.localizedDescription)")
            return
        }

        await MainActor.run { objectWillChange.send() }

        // Capture counts as plain Int locals BEFORE the log interpolation.
        // Letting os_log interpolate `\(self._friendIds.count)` directly was
        // crashing with -[NSObject doesNotRecognizeSelector:] on this build:
        // OSLog's lazy-evaluation closure was generating a `@unowned Int`
        // thunk that hit a Swift→ObjC bridging edge case when reaching back
        // through `self` to access the property under lock contention.
        // Plain `Int` locals avoid the closure capture entirely. Reading the
        // counts without the lock is safe: applyHydration has already
        // committed under the lock above, and we just want a snapshot for
        // logging — a slightly-stale count is acceptable for a log line.
        let friendsCount = _friendIds.count
        let sentCount = _sentPending.count
        let receivedCount = _receivedPending.count
        logger.info("Friendship cache hydrated: \(friendsCount) friends, \(sentCount) sent pending, \(receivedCount) received pending")
    }

    private func applyHydration(sent: [FriendRequest], received: [FriendRequest]) {
        lock.lock()

        _friendIds.removeAll()
        _sentPending.removeAll()
        _receivedPending.removeAll()

        for request in sent {
            switch request.status {
            case "accepted":
                _friendIds.insert(request.receiverId)
            case "pending":
                _sentPending[request.receiverId] = request.id
            default:
                break
            }
        }

        for request in received {
            switch request.status {
            case "accepted":
                _friendIds.insert(request.senderId)
            case "pending":
                _receivedPending[request.senderId] = request.id
            default:
                break
            }
        }

        _isHydrated = true
        lock.unlock()
    }

    // MARK: - Pagination Helper

    private static func fetchAllPages(
        fetch: (Int, Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    ) async throws -> [FriendRequest] {
        var all: [FriendRequest] = []
        var offset = 0
        let pageSize = 100
        while true {
            let page = try await fetch(offset, pageSize)
            all.append(contentsOf: page.data)
            guard page.pagination?.hasMore == true else { break }
            offset += pageSize
        }
        return all
    }

    // MARK: - Mutations (optimistic updates)

    public func didSendRequest(to receiverId: String, requestId: String) {
        lock.lock()
        _sentPending[receiverId] = requestId
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    public func didCancelRequest(to receiverId: String) {
        lock.lock()
        _sentPending.removeValue(forKey: receiverId)
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    public func didAcceptRequest(from senderId: String) {
        lock.lock()
        _receivedPending.removeValue(forKey: senderId)
        _friendIds.insert(senderId)
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    public func didRejectRequest(from senderId: String) {
        lock.lock()
        _receivedPending.removeValue(forKey: senderId)
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    public func didReceiveRequest(from senderId: String, requestId: String) {
        lock.lock()
        _receivedPending[senderId] = requestId
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    // MARK: - Rollback

    public func rollbackSendRequest(to receiverId: String) {
        lock.lock()
        _sentPending.removeValue(forKey: receiverId)
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    public func rollbackAccept(senderId: String, requestId: String) {
        lock.lock()
        _friendIds.remove(senderId)
        _receivedPending[senderId] = requestId
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    public func rollbackReject(senderId: String, requestId: String) {
        lock.lock()
        _receivedPending[senderId] = requestId
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }

    // MARK: - Clear

    public func clear() {
        lock.lock()
        _friendIds.removeAll()
        _sentPending.removeAll()
        _receivedPending.removeAll()
        _isHydrated = false
        lock.unlock()
        Task { @MainActor in self.objectWillChange.send() }
    }
}
