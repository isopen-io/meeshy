import Foundation
import MeeshySDK
import MeeshyUI

/// **Les contacts de la liste `@`, servis depuis le cache et réchauffés à la
/// frappe** (#7847, directive porteur 2026-09-24).
///
/// > « `@` seul ⇒ la liste s'affiche IMMÉDIATEMENT depuis le CACHE, sans
/// > réseau : les contacts de l'utilisateur d'abord […]. Le cache des contacts
/// > est chargé (ou réchauffé) dès la frappe de `@` s'il est vide/périmé. »
///
/// Trois lectures, trois coûts :
/// - `snapshot` — la mémoire, synchrone : ce que la frappe affiche à l'instant ;
/// - `loadCached()` — le magasin GRDB des amis, sans réseau ;
/// - `refreshIfNeeded()` — le réseau, SEULEMENT si le cache est vide ou périmé,
///   et jamais deux fois en parallèle.
///
/// Un échec réseau ne vide rien : ce que le cache a servi reste servi.
@MainActor
protocol MentionContactsProviding: AnyObject {
    var snapshot: [MentionCandidate] { get }
    func loadCached() async -> [MentionCandidate]
    func refreshIfNeeded() async -> [MentionCandidate]
}

@MainActor
final class MentionContactsStore: MentionContactsProviding {
    nonisolated deinit {}

    static let shared = MentionContactsStore()

    private(set) var snapshot: [MentionCandidate] = []

    private let loadCache: () async -> CacheResult<[FriendRequestUser]>
    private let saveCache: ([FriendRequestUser]) async -> Void
    private let fetchFriends: () async throws -> [FriendRequestUser]
    private let currentUserId: () -> String?
    private let now: () -> Date
    private var freshAt: Date?
    private var lastFailure: Date?
    private var inflight: Task<[MentionCandidate], Never>?

    /// Après un échec réseau, la frappe suivante ne relance pas tout de suite :
    /// une route en panne ne doit pas coûter un aller-retour par `@`.
    private static let retryAfterFailure: TimeInterval = 60
    /// Une liste relue il y a moins de dix minutes ne se relit pas à chaque `@`.
    private static let memoryFreshness: TimeInterval = 600
    private static let pageSize = 100
    /// Même plafond que `ContactsListViewModel` : les deux écrivent la MÊME
    /// liste sous la même clé, donc ils doivent la lire en entier de la même façon.
    private static let fetchCap = 500

    init(
        loadCache: @escaping () async -> CacheResult<[FriendRequestUser]> = MentionContactsStore.loadFriendsCache,
        saveCache: @escaping ([FriendRequestUser]) async -> Void = MentionContactsStore.saveFriendsCache,
        fetchFriends: (() async throws -> [FriendRequestUser])? = nil,
        friendService: FriendServiceProviding = FriendService.shared,
        currentUserId: @escaping () -> String? = { AuthManager.shared.currentUser?.id },
        now: @escaping () -> Date = Date.init
    ) {
        self.loadCache = loadCache
        self.saveCache = saveCache
        self.currentUserId = currentUserId
        self.now = now
        self.fetchFriends = fetchFriends ?? {
            try await Self.fetchAcceptedFriends(friendService: friendService, currentUserId: currentUserId() ?? "")
        }
    }

    func loadCached() async -> [MentionCandidate] {
        guard snapshot.isEmpty else { return snapshot }
        _ = await readCache()
        return snapshot
    }

    /// L'appel en vol est posé AVANT la première suspension : deux `@` tapés
    /// dans deux composers à la fois partagent la même lecture.
    func refreshIfNeeded() async -> [MentionCandidate] {
        if let inflight { return await inflight.value }
        guard !isFreshInMemory else { return snapshot }
        let task = Task { [weak self] () -> [MentionCandidate] in
            guard let self else { return [] }
            return await self.revalidate()
        }
        inflight = task
        let result = await task.value
        inflight = nil
        return result
    }

    private func revalidate() async -> [MentionCandidate] {
        guard await !readCache() else { return snapshot }
        guard !recentlyFailed, !(currentUserId() ?? "").isEmpty else { return snapshot }
        return await fetchAndStore()
    }

    private var isFreshInMemory: Bool {
        guard let freshAt else { return false }
        return now().timeIntervalSince(freshAt) < Self.memoryFreshness
    }

    /// `true` ⇔ le cache est FRAIS (aucun réseau à payer). Un cache périmé
    /// sert quand même son contenu : il s'affiche pendant le réchauffement.
    private func readCache() async -> Bool {
        switch await loadCache() {
        case .fresh(let friends, _):
            snapshot = candidates(from: friends)
            freshAt = now()
            return true
        case .stale(let friends, _):
            snapshot = candidates(from: friends)
            return false
        case .expired, .empty:
            return false
        }
    }

    private var recentlyFailed: Bool {
        guard let lastFailure else { return false }
        return now().timeIntervalSince(lastFailure) < Self.retryAfterFailure
    }

    private func fetchAndStore() async -> [MentionCandidate] {
        do {
            let friends = try await fetchFriends()
            lastFailure = nil
            freshAt = now()
            snapshot = candidates(from: friends)
            await saveCache(friends)
        } catch {
            lastFailure = now()
        }
        return snapshot
    }

    private func candidates(from friends: [FriendRequestUser]) -> [MentionCandidate] {
        let me = currentUserId()
        return friends
            .filter { $0.id != me }
            .map { MentionCandidate(id: $0.id, username: $0.username, displayName: $0.name, avatarURL: $0.avatar) }
    }

    /// Même magasin et même clé que la liste de contacts et le sélecteur
    /// d'audience : toutes les surfaces qui nomment « mes contacts » nomment
    /// les mêmes personnes.
    private static func loadFriendsCache() async -> CacheResult<[FriendRequestUser]> {
        let store = await CacheCoordinator.shared.friends
        return await store.load(for: FriendshipCache.PersistenceKeys.friendsList)
    }

    private static func saveFriendsCache(_ friends: [FriendRequestUser]) async {
        let store = await CacheCoordinator.shared.friends
        try? await store.save(friends, for: FriendshipCache.PersistenceKeys.friendsList)
    }

    /// La même lecture que `ContactsListViewModel.fetchFriendsFromNetwork` :
    /// `/users/friend-requests` accepté dans les deux sens, paginé au curseur.
    private static func fetchAcceptedFriends(
        friendService: FriendServiceProviding,
        currentUserId: String
    ) async throws -> [FriendRequestUser] {
        var collected: [FriendRequest] = []
        var cursor: String?
        while collected.count < fetchCap {
            let page = try await friendService.friendRequests(
                direction: .any, status: "accepted", q: nil, cursor: cursor, limit: pageSize
            )
            collected.append(contentsOf: page.data)
            let more = page.pagination?.hasMore ?? (page.data.count == pageSize)
            cursor = page.pagination?.nextCursor
            if !more || page.data.isEmpty || cursor == nil { break }
        }
        return FriendListAggregator.aggregate(received: collected, currentUserId: currentUserId)
    }
}

/// **Le pont vers les listes `@` du SDK** (`MentionSuggestionList`) : l'app y
/// injecte ce magasin par `EnvironmentValues.mentionContactsProvider`, pour que
/// le mood, l'éditeur de story et la feuille « Mentionner » servent les MÊMES
/// contacts, réchauffés de la même façon.
nonisolated struct MentionContactsAudienceBridge: AudienceContactsProviding {

    init() {}

    func cachedContacts() async -> [UserSearchResult] {
        await Self.cached()
    }

    func refreshedContacts() async -> [UserSearchResult]? {
        await Self.refreshed()
    }

    @MainActor
    private static func cached() async -> [UserSearchResult] {
        await MentionContactsStore.shared.loadCached().map(user(from:))
    }

    @MainActor
    private static func refreshed() async -> [UserSearchResult] {
        await MentionContactsStore.shared.refreshIfNeeded().map(user(from:))
    }

    private static func user(from candidate: MentionCandidate) -> UserSearchResult {
        UserSearchResult(id: candidate.id, username: candidate.username,
                         displayName: candidate.displayName, avatar: candidate.avatarURL)
    }
}
