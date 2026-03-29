import Foundation
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

        var allSent: [FriendRequest] = []
        var allReceived: [FriendRequest] = []

        do {
            var offset = 0
            let pageSize = 100
            while true {
                let page = try await friendService.sentRequests(offset: offset, limit: pageSize)
                allSent.append(contentsOf: page.data)
                guard page.pagination?.hasMore == true else { break }
                offset += pageSize
            }

            offset = 0
            while true {
                let page = try await friendService.receivedRequests(offset: offset, limit: pageSize)
                allReceived.append(contentsOf: page.data)
                guard page.pagination?.hasMore == true else { break }
                offset += pageSize
            }
        } catch {
            logger.error("Failed to hydrate friendship cache: \(error.localizedDescription)")
            return
        }

        applyHydration(sent: allSent, received: allReceived)

        await MainActor.run { objectWillChange.send() }

        logger.info("Friendship cache hydrated: \(self._friendIds.count) friends, \(self._sentPending.count) sent pending, \(self._receivedPending.count) received pending")
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
