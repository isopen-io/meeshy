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

    private let logger = MeeshyLog.logger(.friendshipCache, subsystem: .legacySDK)

    /// Monotonic version bumped on every mutation. Use `@ObservedObject` on
    /// `FriendshipCache.shared` and observe `version` (or `$version` via
    /// Combine) to react to cache changes without manually subscribing to
    /// `objectWillChange`. ViewModels that already expose their own
    /// `objectWillChange` should subscribe to `$version` and re-emit.
    @Published public private(set) var version: Int = 0

    private struct State {
        var friendIds: Set<String> = []
        var sentPending: [String: String] = [:]      // receiverId -> requestId
        var receivedPending: [String: String] = [:]   // senderId -> requestId
        var isHydrated = false
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
        var hydrationTask: Task<Void, Never>?
        /// Generation counter bumped every time the in-flight slot changes.
        /// Lets the owner of a finishing task tell whether its slot is still
        /// theirs (versus reset by `clear()` or replaced by a later hydrate)
        /// before clearing it — avoids wiping a fresh task's pointer.
        var hydrationGen: UInt64 = 0

        func status(for userId: String) -> FriendshipStatus {
            if friendIds.contains(userId) { return .friend }
            if let requestId = sentPending[userId] { return .pendingSent(requestId: requestId) }
            if let requestId = receivedPending[userId] { return .pendingReceived(requestId: requestId) }
            return .none
        }

        mutating func record(sent: [FriendRequest], received: [FriendRequest]) {
            for request in sent {
                switch request.status {
                case "accepted": friendIds.insert(request.receiverId)
                case "pending": sentPending[request.receiverId] = request.id
                default: break
                }
            }
            for request in received {
                switch request.status {
                case "accepted": friendIds.insert(request.senderId)
                case "pending": receivedPending[request.senderId] = request.id
                default: break
                }
            }
        }

        mutating func reset() {
            friendIds.removeAll()
            sentPending.removeAll()
            receivedPending.removeAll()
        }
    }

    private let state = Locked(State())

    public var isHydrated: Bool {
        state.read { $0.isHydrated }
    }

    public var friendIds: Set<String> {
        state.read { $0.friendIds }
    }

    public var friendCount: Int {
        state.read { $0.friendIds.count }
    }

    public var pendingReceivedCount: Int {
        state.read { $0.receivedPending.count }
    }

    private init() {}

    // MARK: - Lookup

    public func status(for userId: String) -> FriendshipStatus {
        state.read { $0.status(for: userId) }
    }

    public func isFriend(_ userId: String) -> Bool {
        state.read { $0.friendIds.contains(userId) }
    }

    // MARK: - Hydrate (call once after login)

    /// cache-08 — tuple de seed hors-ligne (stores GRDB persistés) servi
    /// AVANT le round-trip réseau : au cold start offline, les statuts
    /// d'amitié ne sont plus faux (.none pour de vrais amis).
    public typealias FriendshipSeed = (friends: [FriendRequestUser], received: [FriendRequest], sent: [FriendRequest])

    /// Lecture par défaut du seed : les stores GRDB déjà persistés
    /// (friends_list, requests:received, requests:sent), au-delà du TTL.
    private static let defaultSeedSource: @Sendable @concurrent () async -> FriendshipSeed? = {
        let coord = CacheCoordinator.shared
        let friends = await coord.friends.loadIgnoringExpiry(for: PersistenceKeys.friendsList)
        let received = await coord.friendRequests.loadIgnoringExpiry(for: PersistenceKeys.receivedRequests)
        let sent = await coord.friendRequests.loadIgnoringExpiry(for: PersistenceKeys.sentRequests)
        if friends == nil && received == nil && sent == nil { return nil }
        return (friends?.items ?? [], received?.items ?? [], sent?.items ?? [])
    }

    public func hydrate(
        friendService: FriendServiceProviding = FriendService.shared,
        seedSource: (@Sendable () async -> FriendshipSeed?)? = nil
    ) async {
        // Fast path: already hydrated, nothing to do. The check is intentionally
        // outside the lock — `isHydrated` takes the lock itself, and a stale
        // false-read just falls through to the coalescer below where the
        // in-flight task does the actual deduplication.
        if isHydrated { return }

        // Coalesce concurrent callers onto a single in-flight task. The
        // claim/release dance lives in synchronous helpers because Swift 6
        // forbids taking a lock directly from an async
        // context (it would risk a thread-hop while the lock is held).
        let claim = claimOrJoinHydration(
            friendService: friendService,
            seedSource: seedSource ?? Self.defaultSeedSource
        )
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
        friendService: FriendServiceProviding,
        seedSource: @escaping @Sendable () async -> FriendshipSeed?
    ) -> (task: Task<Void, Never>, ownerGen: UInt64?) {
        state.mutateUnchecked { state in
            if let existing = state.hydrationTask {
                return (existing, nil)
            }
            state.hydrationGen &+= 1
            let myGen = state.hydrationGen
            let newTask: Task<Void, Never> = Task { [weak self] in
                guard let self else { return }
                await self.performHydration(friendService: friendService, seedSource: seedSource)
            }
            state.hydrationTask = newTask
            return (newTask, myGen)
        }
    }

    /// Release the in-flight slot — but only if its generation is still
    /// current. A logout that called `clear()` mid-flight bumps the
    /// generation, so the cancelled task's owner harmlessly skips the
    /// release here and the freshly-started hydration keeps its slot.
    private func releaseHydrationOwnership(gen: UInt64) {
        state.mutate { state in
            if state.hydrationGen == gen {
                state.hydrationTask = nil
            }
        }
    }

    private func performHydration(
        friendService: FriendServiceProviding,
        seedSource: @Sendable () async -> FriendshipSeed?
    ) async {
        logger.info("Hydrating friendship cache...")

        // cache-08 — seed hors-ligne AVANT le round-trip : au cold start sans
        // réseau, les statuts sont servis depuis les stores persistés au lieu
        // de .none ; le fetch reste tenté et écrase dès qu'il répond.
        if let seed = await seedSource() {
            applySeed(friends: seed.friends, received: seed.received, sent: seed.sent)
        }

        do {
            // Fetch sent and received requests in parallel
            async let sentTask = Self.fetchAllPages { cursor, limit in
                try await friendService.friendRequests(
                    direction: .sent, status: nil, q: nil, cursor: cursor, limit: limit
                )
            }
            async let receivedTask = Self.fetchAllPages { cursor, limit in
                try await friendService.friendRequests(
                    direction: .received, status: nil, q: nil, cursor: cursor, limit: limit
                )
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
        // Plain `Int` locals avoid the closure capture entirely. Lus SOUS le
        // verrou : cette tâche tourne hors du fil principal, et une demande
        // d'ami reçue ou une déconnexion mute ces collections au même instant
        // — `count` lu pendant qu'un `Set` se réalloue lit une mémoire libérée.
        let (friendsCount, sentCount, receivedCount) = state.read {
            ($0.friendIds.count, $0.sentPending.count, $0.receivedPending.count)
        }
        logger.info("Friendship cache hydrated: \(friendsCount) friends, \(sentCount) sent pending, \(receivedCount) received pending")
    }

    /// cache-08 — seed hors-ligne : appliqué UNIQUEMENT sur un cache vide
    /// (jamais par-dessus un état réseau ou des mutations optimistes), ne
    /// pose JAMAIS isHydrated — le réseau reste tenté et écrase dès qu'il
    /// répond.
    private func applySeed(friends: [FriendRequestUser], received: [FriendRequest], sent: [FriendRequest]) {
        let friendIds = friends.map(\.id)
        let shouldApply = state.mutate { state -> Bool in
            guard state.friendIds.isEmpty && state.sentPending.isEmpty && state.receivedPending.isEmpty else { return false }
            state.friendIds.formUnion(friendIds)
            state.record(sent: sent, received: received)
            return true
        }
        if shouldApply { notifyChange() }
    }

    private func applyHydration(sent: [FriendRequest], received: [FriendRequest]) {
        state.mutate { state in
            state.reset()
            state.record(sent: sent, received: received)
            state.isHydrated = true
        }
    }

    // MARK: - Pagination Helper

    private static func fetchAllPages(
        fetch: (String?, Int) async throws -> PaginatedAPIResponse<[FriendRequest]>
    ) async throws -> [FriendRequest] {
        var all: [FriendRequest] = []
        var cursor: String?
        let pageSize = 100
        while true {
            let page = try await fetch(cursor, pageSize)
            all.append(contentsOf: page.data)
            guard page.pagination?.hasMore == true else { break }
            cursor = page.pagination?.nextCursor
            // Sans curseur, redemander la même page tournerait sans fin.
            guard cursor != nil else { break }
        }
        return all
    }

    // MARK: - Mutations (optimistic updates)

    public func didSendRequest(to receiverId: String, requestId: String) {
        state.mutate { _ = $0.sentPending[receiverId] = requestId }
        notifyChange()
    }

    public func didCancelRequest(to receiverId: String) {
        state.mutate { _ = $0.sentPending.removeValue(forKey: receiverId) }
        notifyChange()
    }

    public func didAcceptRequest(from senderId: String) {
        state.mutate { state in
            state.receivedPending.removeValue(forKey: senderId)
            state.friendIds.insert(senderId)
        }
        notifyChange()
    }

    public func didRejectRequest(from senderId: String) {
        state.mutate { _ = $0.receivedPending.removeValue(forKey: senderId) }
        notifyChange()
    }

    public func didReceiveRequest(from senderId: String, requestId: String) {
        state.mutate { _ = $0.receivedPending[senderId] = requestId }
        notifyChange()
    }

    /// Used when a friendship is severed from the contacts list (e.g. the
    /// "Remove friend" action) — drops the user from the accepted set so the
    /// resolver returns `.none` everywhere immediately.
    public func didRemoveFriend(_ userId: String) {
        state.mutate { _ = $0.friendIds.remove(userId) }
        notifyChange()
    }

    // MARK: - Rollback

    public func rollbackSendRequest(to receiverId: String) {
        state.mutate { _ = $0.sentPending.removeValue(forKey: receiverId) }
        notifyChange()
    }

    public func rollbackAccept(senderId: String, requestId: String) {
        state.mutate { state in
            state.friendIds.remove(senderId)
            state.receivedPending[senderId] = requestId
        }
        notifyChange()
    }

    public func rollbackReject(senderId: String, requestId: String) {
        state.mutate { _ = $0.receivedPending[senderId] = requestId }
        notifyChange()
    }

    // MARK: - Change notification

    /// Bump the version on the main actor. `@Published` will fire
    /// `objectWillChange` automatically, so any `@ObservedObject` view or any
    /// Combine subscriber on `$version` reacts. We hop to the main actor
    /// because `@Published` mutations must originate there.
    ///
    /// Persistence invalidation is NOT triggered from here on purpose:
    /// callers (RequestsViewModel, ConnectionActionView, NotificationToastManager)
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
    // persistent store. It is NEVER called automatically: `notifyChange()`
    // only bumps `version` (see its doc comment for why the invalidation is
    // deliberately not grafted there). EVERY mutation site must call — and
    // await — it itself, socket listeners included
    // (`friend-request:cancelled` / `friend-request:rejected`), otherwise the
    // Requests screen keeps serving the removed row from GRDB.

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
        // Cancel any in-flight hydration so an old user's response doesn't
        // overwrite the freshly-cleared state when its applyHydration() lands
        // after this clear() — a leak that would re-expose the previous
        // account's friend graph to the new session on logout/login. Bump the
        // generation so the cancelled task's owner-cleanup in hydrate()
        // recognises its slot is no longer current and skips the clear.
        let inflight = state.mutate { state -> Task<Void, Never>? in
            defer {
                state.hydrationTask = nil
                state.hydrationGen &+= 1
                state.reset()
                state.isHydrated = false
            }
            return state.hydrationTask
        }
        inflight?.cancel()
        notifyChange()
    }
}
