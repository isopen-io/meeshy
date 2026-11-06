import Foundation
import Combine
import MeeshySDK

// MARK: - La section Messages de la recherche de la liste (#14619)

/// Ce que la barre de recherche de la liste trouve dans les MESSAGES, sous
/// les conversations qu'elle filtre déjà.
///
/// Le modèle s'abonne au texte de recherche ISOLÉ (`ConversationSearchTextModel`,
/// #7158) : la racine de la liste ne le lit jamais, donc une frappe ne
/// ré-évalue que la section qui en dépend.
///
/// Cache-first : l'index local (FTS5) répond d'abord et s'affiche aussitôt ;
/// le volet réseau complète ensuite, sans jamais vider ce qui est à l'écran.
///
/// Le volet réseau se pagine (#16475) : `loadMore()` suit `nextCursor`, au
/// défilement, jusqu'à ce que le serveur n'ait plus rien ou que la section ait
/// atteint sa taille.
@MainActor
final class ConversationListMessageSearchModel: ObservableObject {
    nonisolated deinit {}

    static let minimumQueryLength = 2
    static let sectionCapacity = 150
    private static let remoteCacheCapacity = 5
    private static let remoteCacheTTL: TimeInterval = 120

    @Published private(set) var results: [GlobalSearchMessageResult] = []
    @Published private(set) var isSearching = false
    @Published private(set) var query = ""
    @Published private(set) var isLoadingMore = false
    @Published private(set) var nextCursor: String?

    private let search: ConversationMessageSearchProviding
    private let reader: () -> MeeshyUser?
    private let now: () -> Date
    private let contentLocks: () -> Set<String>
    private var remoteCache: [(query: String, items: [GlobalSearchMessageResult], nextCursor: String?, at: Date)] = []
    private var localItems: [GlobalSearchMessageResult] = []
    private var remoteItems: [GlobalSearchMessageResult] = []
    private var cancellables = Set<AnyCancellable>()
    private var task: Task<Void, Never>?

    init(
        text: AnyPublisher<String, Never>,
        search: ConversationMessageSearchProviding,
        reader: @escaping () -> MeeshyUser? = { AuthManager.shared.currentUser },
        debounce: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(300),
        now: @escaping () -> Date = Date.init,
        contentLocks: @escaping () -> Set<String> = { ConversationLockManager.shared.contentLockedConversationIds }
    ) {
        self.search = search
        self.reader = reader
        self.now = now
        self.contentLocks = contentLocks
        text
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .removeDuplicates()
            .debounce(for: debounce, scheduler: DispatchQueue.main)
            .sink { [weak self] query in self?.schedule(query) }
            .store(in: &cancellables)
    }

    /// Une requête trop courte n'affiche RIEN : la section disparaît.
    var showsSection: Bool { query.count >= Self.minimumQueryLength && (!results.isEmpty || isSearching) }

    var canLoadMore: Bool { nextCursor != nil && results.count < Self.sectionCapacity }

    private func schedule(_ query: String) {
        task?.cancel()
        guard query.count >= Self.minimumQueryLength else {
            task = nil
            clear()
            return
        }
        task = Task { [weak self] in await self?.run(query: query) }
    }

    /// Lance une recherche complète — local puis réseau — pour `query`.
    func run(query: String) async {
        let user = reader()
        self.query = query
        isSearching = true
        nextCursor = nil
        let local = await search.localMessages(query: query, reader: user)
        guard !Task.isCancelled else { return }
        localItems = local
        if let cached = cachedRemote(for: query) {
            serve(remote: cached.items, nextCursor: cached.nextCursor)
            return
        }
        if !local.isEmpty { results = merged(remote: []) }
        let remote = await search.remoteMessages(query: query, reader: user, after: nil)
        guard !Task.isCancelled else { return }
        if remote.failure == nil { remember(remote.items, nextCursor: remote.nextCursor, for: query) }
        serve(remote: remote.items, nextCursor: remote.nextCursor)
    }

    /// La page suivante. Un échec garde ce qui est à l'écran et le curseur :
    /// le prochain passage du défilement la redemande.
    func loadMore() async {
        guard canLoadMore, !isLoadingMore, !isSearching, let cursor = nextCursor else { return }
        let query = self.query
        isLoadingMore = true
        defer { isLoadingMore = false }
        let page = await search.remoteMessages(query: query, reader: reader(), after: cursor)
        guard !Task.isCancelled, query == self.query, cursor == nextCursor else { return }
        let remote = remoteItems + page.items
        if page.failure == nil { remember(remote, nextCursor: page.nextCursor, for: query) }
        serve(remote: remote, nextCursor: page.nextCursor)
    }

    private func merged(remote: [GlobalSearchMessageResult]) -> [GlobalSearchMessageResult] {
        ConversationMessageSearchService.merged(local: localItems, remote: remote, contentLocks: contentLocks())
    }

    private func serve(remote: [GlobalSearchMessageResult], nextCursor: String?) {
        remoteItems = remote
        self.nextCursor = nextCursor
        results = merged(remote: remote)
        isSearching = false
    }

    private func clear() {
        results = []
        localItems = []
        remoteItems = []
        nextCursor = nil
        query = ""
        isSearching = false
    }

    private func cachedRemote(for query: String) -> (items: [GlobalSearchMessageResult], nextCursor: String?)? {
        let key = query.lowercased()
        guard let entry = remoteCache.first(where: { $0.query == key }),
              now().timeIntervalSince(entry.at) < Self.remoteCacheTTL else { return nil }
        return (entry.items, entry.nextCursor)
    }

    private func remember(_ items: [GlobalSearchMessageResult], nextCursor: String?, for query: String) {
        let key = query.lowercased()
        remoteCache = Array((remoteCache.filter { $0.query != key } + [(key, items, nextCursor, now())]).suffix(Self.remoteCacheCapacity))
    }
}
