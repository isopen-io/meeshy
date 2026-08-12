import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class ContactsListViewModel: ObservableObject {
    @Published var friends: [FriendRequestUser] = []
    @Published var loadState: LoadState = .idle
    @Published var activeFilter: ContactFilter = .all
    @Published var searchQuery: String = ""

    private let friendService: FriendServiceProviding
    private let currentUserId: String
    private let friendshipCache: FriendshipCache
    private var cacheVersionSubscription: AnyCancellable?
    private var lastObservedFriendIds: Set<String> = []
    private var reconcileTask: Task<Void, Never>?
    private let cacheKey = FriendshipCache.PersistenceKeys.friendsList

    var filteredFriends: [FriendRequestUser] {
        var result = friends

        switch activeFilter {
        case .online:
            result = result.filter { $0.isOnline == true }
        case .offline:
            result = result.filter { $0.isOnline != true }
        case .all, .phonebook, .affiliates:
            break
        }

        if !searchQuery.isEmpty {
            let query = searchQuery.lowercased()
            result = result.filter {
                $0.username.lowercased().contains(query) ||
                $0.name.lowercased().contains(query)
            }
        }

        return result
    }

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? "",
        friendshipCache: FriendshipCache = .shared
    ) {
        self.friendService = friendService
        self.currentUserId = currentUserId
        self.friendshipCache = friendshipCache
        observeFriendshipCache()
    }

    deinit {
        reconcileTask?.cancel()
    }

    // MARK: - Cache Observation

    /// Reconcile the local `friends` list whenever the friendship cache
    /// mutates from anywhere in the app (Requests tab accepting, profile
    /// sheet accepting, push notifications eventually).
    ///
    /// Removals are applied locally without a network call. Additions
    /// trigger a silent SWR fetch — we don't have the user record (name,
    /// avatar, presence) until the gateway returns it.
    private func observeFriendshipCache() {
        lastObservedFriendIds = friendshipCache.friendIds
        cacheVersionSubscription = friendshipCache.$version
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.reconcileWithCache() }
    }

    private func reconcileWithCache() {
        let cacheIds = friendshipCache.friendIds
        guard cacheIds != lastObservedFriendIds else { return }
        let previous = lastObservedFriendIds
        lastObservedFriendIds = cacheIds

        let removed = previous.subtracting(cacheIds)
        if !removed.isEmpty {
            friends.removeAll { removed.contains($0.id) }
            persistFriends()
        }

        let added = cacheIds.subtracting(previous)
        if !added.isEmpty {
            // We only have the userId at this point — the FriendRequestUser
            // record lives on the gateway. Trigger a silent refetch so the
            // new contact appears with its full details. Reusing the SWR
            // fetcher keeps the cache layer consistent.
            reconcileTask?.cancel()
            reconcileTask = Task { [weak self] in
                await self?.fetchFriendsFromNetwork(cacheKey: self?.cacheKey ?? "friends_list")
            }
        }
    }

    private func persistFriends() {
        let snapshot = friends
        Task { try? await CacheCoordinator.shared.friends.save(snapshot, for: cacheKey) }
    }

    // MARK: - Load Friends

    func loadFriends() async {
        let cached = await CacheCoordinator.shared.friends.load(for: cacheKey)

        switch cached {
        case .fresh(let data, _):
            friends = data
            loadState = .loaded
            // Even when GRDB reports `.fresh`, we may have an in-memory
            // FriendshipCache that's *ahead* of the persistent store (the
            // user accepted a request elsewhere, the friendship cache flipped,
            // but no consumer has refetched yet). If the two views disagree,
            // force a background revalidate so the GRDB cache and `friends`
            // list converge on the gateway's truth.
            if cacheLagsBehindFriendship(data: data) {
                Task { [weak self] in
                    await self?.fetchFriendsFromNetwork(cacheKey: self?.cacheKey ?? FriendshipCache.PersistenceKeys.friendsList)
                }
            }
            return

        case .stale(let data, _):
            friends = data
            loadState = .loaded
            Task { [weak self] in
                await self?.fetchFriendsFromNetwork(cacheKey: self?.cacheKey ?? FriendshipCache.PersistenceKeys.friendsList)
            }
            return

        case .expired, .empty:
            loadState = friends.isEmpty ? .loading : .loaded
        }

        await fetchFriendsFromNetwork(cacheKey: cacheKey)
    }

    /// True when the in-memory FriendshipCache and the loaded GRDB list
    /// disagree on the friend set — that's the signature of a cross-screen
    /// mutation that happened while this ViewModel was asleep. Triggers an
    /// opportunistic revalidate to reconcile.
    private func cacheLagsBehindFriendship(data: [FriendRequestUser]) -> Bool {
        let cachedIds = Set(data.map(\.id))
        let memoryIds = friendshipCache.friendIds
        return cachedIds != memoryIds
    }

    private func fetchFriendsFromNetwork(cacheKey: String) async {
        do {
            async let receivedResponse = friendService.receivedRequests(offset: 0, limit: 100)
            async let sentResponse = friendService.sentRequests(offset: 0, limit: 100)

            let (received, sent) = try await (receivedResponse, sentResponse)

            friends = FriendListAggregator.aggregate(
                received: received.data,
                sent: sent.data,
                currentUserId: currentUserId
            )

            loadState = .loaded
            lastObservedFriendIds = Set(friends.map(\.id))
            try? await CacheCoordinator.shared.friends.save(friends, for: cacheKey)
        } catch {
            if friends.isEmpty {
                loadState = .error("Erreur lors du chargement")
            }
        }
    }

    // MARK: - Actions

    func setFilter(_ filter: ContactFilter) {
        activeFilter = filter
        HapticFeedback.light()
    }

    func search(_ query: String) {
        searchQuery = query
    }
}
