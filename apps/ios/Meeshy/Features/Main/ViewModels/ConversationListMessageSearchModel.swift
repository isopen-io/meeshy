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
@MainActor
final class ConversationListMessageSearchModel: ObservableObject {
    nonisolated deinit {}

    static let minimumQueryLength = 2
    private static let remoteCacheCapacity = 5
    private static let remoteCacheTTL: TimeInterval = 120

    @Published private(set) var results: [GlobalSearchMessageResult] = []
    @Published private(set) var isSearching = false
    @Published private(set) var query = ""

    private let search: ConversationMessageSearchProviding
    private let reader: () -> MeeshyUser?
    private let now: () -> Date
    private var remoteCache: [(query: String, items: [GlobalSearchMessageResult], at: Date)] = []
    private var cancellables = Set<AnyCancellable>()
    private var task: Task<Void, Never>?

    init(
        text: AnyPublisher<String, Never>,
        search: ConversationMessageSearchProviding,
        reader: @escaping () -> MeeshyUser? = { AuthManager.shared.currentUser },
        debounce: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(300),
        now: @escaping () -> Date = Date.init
    ) {
        self.search = search
        self.reader = reader
        self.now = now
        text
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .removeDuplicates()
            .debounce(for: debounce, scheduler: DispatchQueue.main)
            .sink { [weak self] query in self?.schedule(query) }
            .store(in: &cancellables)
    }

    /// Une requête trop courte n'affiche RIEN : la section disparaît.
    var showsSection: Bool { query.count >= Self.minimumQueryLength && (!results.isEmpty || isSearching) }

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
        let local = await search.localMessages(query: query, reader: user)
        guard !Task.isCancelled else { return }
        if let cached = cachedRemote(for: query) {
            publish(ConversationMessageSearchService.merged(local: local, remote: cached))
            return
        }
        if !local.isEmpty { results = local }
        let remote = await search.remoteMessages(query: query, reader: user)
        guard !Task.isCancelled else { return }
        if remote.failure == nil { remember(remote.items, for: query) }
        publish(ConversationMessageSearchService.merged(local: local, remote: remote.items))
    }

    private func publish(_ items: [GlobalSearchMessageResult]) {
        results = items
        isSearching = false
    }

    private func clear() {
        results = []
        query = ""
        isSearching = false
    }

    private func cachedRemote(for query: String) -> [GlobalSearchMessageResult]? {
        let key = query.lowercased()
        guard let entry = remoteCache.first(where: { $0.query == key }),
              now().timeIntervalSince(entry.at) < Self.remoteCacheTTL else { return nil }
        return entry.items
    }

    private func remember(_ items: [GlobalSearchMessageResult], for query: String) {
        let key = query.lowercased()
        remoteCache = Array((remoteCache.filter { $0.query != key } + [(key, items, now())]).suffix(Self.remoteCacheCapacity))
    }
}
