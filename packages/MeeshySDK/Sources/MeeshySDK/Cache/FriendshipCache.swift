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

    /// Monotonic version bumped on every mutation. Use `@ObservedObject` on
    /// `FriendshipCache.shared` and observe `version` (or `$version` via
    /// Combine) to react to cache changes without manually subscribing to
    /// `objectWillChange`. ViewModels that already expose their own
    /// `objectWillChange` should subscribe to `$version` and re-emit.
    @Published public private(set) var version: Int = 0

    private var _friendIds: Set<String> = []
    private var _sentPending: [String: String] = [:]      // receiverId -> requestId
    private var _receivedPending: [String: String] = [:]   // senderId -> requestId
    private var _isHydrated = false
    /// Currently running hydration task. Used to coalesce concurrent
    /// `hydrate()` callers — without this, MeeshyApp dispatched two
    /// hydrations on warm-start (one from `task { }` at launch and one
    /// from the auth `onChange`) and the second `applyHydration`'s
    /// `removeAll()` crashed in `swift_deallocClassInstance` on iOS 26
    /// because the dictionary's storage was being released while the
    /// first hydration's task graph still held strong references to
    /// the same FriendRequest values. Coalescing makes hydrate()
    /// idempotent: parallel callers share the same network roundtrip
    /// and the same applyHydration call.
    private var _hydrationTask: Task<Void, Never>?
    /// Generation counter bumped every time the in-flight slot changes.
    /// Lets the owner of a finishing task tell whether its slot is still
    /// theirs (versus reset by `clear()` or replaced by a later hydrate)
    /// before clearing it — avoids wiping a fresh task's pointer.
    private var _hydrationGen: UInt64 = 0

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
        // Fast path: already hydrated, nothing to do. The check is intentionally
        // outside the lock — `isHydrated` takes the lock itself, and a stale
        // false-read just falls through to the coalescer below where the
        // in-flight task does the actual deduplication.
        if isHydrated { return }

        // Coalesce concurrent callers onto a single in-flight task. The
        // claim/release dance lives in synchronous helpers because Swift 6
        // forbids calling `NSLock.lock()/unlock()` directly from an async
        // context (it would risk a thread-hop while the lock is held).
        let claim = claimOrJoinHydration(friendService: friendService)
        await claim.task.value
        if let myGen = claim.ownerGen {
            releaseHydrationOwnership(gen: myGen)
        }
    }

    /// Synchronous critical section that picks an existing in-flight task
    /// to await, or installs a new one. Returns the task to await and, if
    /// the caller is the *owner* (i.e. installed a new task), the generation
    /// number so it can later release the slot.
    private func claimOrJoinHydration(
        friendService: FriendServiceProviding
    ) -> (task: Task<Void, Never>, ownerGen: UInt64?) {
        lock.lock()
        defer { lock.unlock() }
        if let existing = _hydrationTask {
            return (existing, nil)
        }
        _hydrationGen &+= 1
        let myGen = _hydrationGen
        let newTask: Task<Void, Never> = Task { [weak self] in
            guard let self else { return }
            await self.performHydration(friendService: friendService)
        }
        _hydrationTask = newTask
        return (newTask, myGen)
    }

    /// Release the in-flight slot — but only if its generation is still
    /// current. A logout that called `clear()` mid-flight bumps the
    /// generation, so the cancelled task's owner harmlessly skips the
    /// release here and the freshly-started hydration keeps its slot.
    private func releaseHydrationOwnership(gen: UInt64) {
        lock.lock()
        defer { lock.unlock() }
        if _hydrationGen == gen {
            _hydrationTask = nil
        }
    }

    private func performHydration(friendService: FriendServiceProviding) async {
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

        await MainActor.run { self.version &+= 1 }

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
        // `defer` guarantees the lock is released even if a Swift runtime
        // fatal error fires inside `removeAll()` or one of the `insert`
        // calls — without this, a single bad mutation would deadlock every
        // subsequent reader on the singleton lock.
        defer { lock.unlock() }

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
        notifyChange()
    }

    public func didCancelRequest(to receiverId: String) {
        lock.lock()
        _sentPending.removeValue(forKey: receiverId)
        lock.unlock()
        notifyChange()
    }

    public func didAcceptRequest(from senderId: String) {
        lock.lock()
        _receivedPending.removeValue(forKey: senderId)
        _friendIds.insert(senderId)
        lock.unlock()
        notifyChange()
    }

    public func didRejectRequest(from senderId: String) {
        lock.lock()
        _receivedPending.removeValue(forKey: senderId)
        lock.unlock()
        notifyChange()
    }

    public func didReceiveRequest(from senderId: String, requestId: String) {
        lock.lock()
        _receivedPending[senderId] = requestId
        lock.unlock()
        notifyChange()
    }

    /// Used when a friendship is severed from the contacts list (e.g. the
    /// "Remove friend" action) — drops the user from the accepted set so the
    /// resolver returns `.none` everywhere immediately.
    public func didRemoveFriend(_ userId: String) {
        lock.lock()
        _friendIds.remove(userId)
        lock.unlock()
        notifyChange()
    }

    // MARK: - Rollback

    public func rollbackSendRequest(to receiverId: String) {
        lock.lock()
        _sentPending.removeValue(forKey: receiverId)
        lock.unlock()
        notifyChange()
    }

    public func rollbackAccept(senderId: String, requestId: String) {
        lock.lock()
        _friendIds.remove(senderId)
        _receivedPending[senderId] = requestId
        lock.unlock()
        notifyChange()
    }

    public func rollbackReject(senderId: String, requestId: String) {
        lock.lock()
        _receivedPending[senderId] = requestId
        lock.unlock()
        notifyChange()
    }

    // MARK: - Change notification

    /// Bump the version on the main actor. `@Published` will fire
    /// `objectWillChange` automatically, so any `@ObservedObject` view or any
    /// Combine subscriber on `$version` reacts. We hop to the main actor
    /// because `@Published` mutations must originate there.
    ///
    /// Persistence invalidation is NOT triggered from here on purpose:
    /// callers (RequestsViewModel, ConnectionActionView, NotificationManager)
    /// often need to interleave invalidation with an optimistic `save()`
    /// into the same GRDB entry, and a fire-and-forget Task here would race
    /// against that save. Each mutation site invokes
    /// `invalidatePersistedFriendCaches()` explicitly so the order is
    /// deterministic.
    private func notifyChange() {
        Task { @MainActor in self.version &+= 1 }
    }

    // MARK: - Persistence Invalidation
    //
    // Every mutation flips the in-memory cache instantly, but downstream
    // GRDB stores (the persistent contacts list, the persistent received /
    // sent request lists) keep their own copy. If those caches are still
    // `.fresh` (within TTL) when the next consumer loads them, the consumer
    // would serve stale data without revalidating — masking the mutation.
    //
    // `invalidatePersistedFriendCaches()` marks the three friendship-derived
    // GRDB entries as expired so the next `loadFriends()` / `loadReceived()`
    // / `loadSent()` is forced to round-trip the gateway and refresh the
    // persistent store. Called automatically from `notifyChange()` so every
    // mutation cascades; also exposed `public` so call sites can await it
    // explicitly when they need the invalidation to complete before
    // continuing (e.g. before reading the cache again).

    /// Cache keys for the friendship-derived persistent stores.
    /// Kept here so RequestsViewModel and ContactsListViewModel use a single
    /// source of truth instead of duplicating string literals.
    public enum PersistenceKeys {
        public static let friendsList = "friends_list"
        public static let receivedRequests = "requests:received"
        public static let sentRequests = "requests:sent"
    }

    /// Invalidate the three friendship-derived GRDB caches so the next load
    /// forces a fresh server fetch. Safe to call from any actor.
    public func invalidatePersistedFriendCaches() async {
        let coord = CacheCoordinator.shared
        await coord.friends.invalidate(for: PersistenceKeys.friendsList)
        await coord.friendRequests.invalidate(for: PersistenceKeys.receivedRequests)
        await coord.friendRequests.invalidate(for: PersistenceKeys.sentRequests)
    }

    // MARK: - Clear

    public func clear() {
        lock.lock()
        // Cancel any in-flight hydration so an old user's response doesn't
        // overwrite the freshly-cleared state when its applyHydration() lands
        // after this clear() — a leak that would re-expose the previous
        // account's friend graph to the new session on logout/login. Bump the
        // generation so the cancelled task's owner-cleanup in hydrate()
        // recognises its slot is no longer current and skips the clear.
        let inflight = _hydrationTask
        _hydrationTask = nil
        _hydrationGen &+= 1
        _friendIds.removeAll()
        _sentPending.removeAll()
        _receivedPending.removeAll()
        _isHydrated = false
        lock.unlock()
        inflight?.cancel()
        notifyChange()
    }
}
