import Foundation
import Combine
import MeeshySDK
import os

// MARK: - L'écran « Médias, liens et documents » d'une conversation (#8103)
//
// Un segment par genre de l'index (`ConversationMediaKind`), chacun :
// - CACHE D'ABORD — l'index persisté du genre se peint aussitôt, sans
//   spinner ; la tête se revalide en silence (SWR) ;
// - PAGINÉ par `before` quand la liste touche sa fin, jamais d'avance ;
// - HORS LIGNE, lisible : l'index déjà vu reste affiché, la recherche filtre
//   ce qui est connu.
// Ce modèle ne tient que des MÉTADONNÉES : les octets d'un média ne se
// téléchargent qu'à son ouverture (galerie, lecteur, document).

// MARK: - Persistance

/// Où l'index d'un genre se garde entre deux ouvertures.
protocol ConversationMediaHubIndexStoring: Sendable {
    func load(conversationId: String, kind: ConversationMediaKind) async -> CacheResult<[MeeshyMessage]>
    /// UNIT les porteurs à l'index du genre — jamais n'écrase : la galerie
    /// (#8095) écrit le même index visuel.
    func merge(_ carriers: [MeeshyMessage], conversationId: String, kind: ConversationMediaKind) async
    func isComplete(conversationId: String, kind: ConversationMediaKind) async -> Bool
    func markComplete(conversationId: String, kind: ConversationMediaKind) async
}

struct CachedConversationMediaHubStore: ConversationMediaHubIndexStoring {
    func load(conversationId: String, kind: ConversationMediaKind) async -> CacheResult<[MeeshyMessage]> {
        await CacheCoordinator.shared.conversationMedia.load(for: kind.indexKey(conversationId: conversationId))
    }

    func merge(_ carriers: [MeeshyMessage], conversationId: String, kind: ConversationMediaKind) async {
        let key = kind.indexKey(conversationId: conversationId)
        let existing = await CacheCoordinator.shared.conversationMedia.load(for: key).snapshot() ?? []
        let merged = ConversationMediaHubViewModel.union(existing, carriers)
        try? await CacheCoordinator.shared.conversationMedia.save(merged, for: key)
    }

    func isComplete(conversationId: String, kind: ConversationMediaKind) async -> Bool {
        await CacheCoordinator.shared.conversationMedia
            .loadCursor(for: kind.indexKey(conversationId: conversationId))?.hasMore == false
    }

    func markComplete(conversationId: String, kind: ConversationMediaKind) async {
        await CacheCoordinator.shared.conversationMedia
            .saveCursor(nextCursor: nil, hasMore: false, for: kind.indexKey(conversationId: conversationId))
    }
}

// MARK: - Ce que l'écran lit

enum ConversationMediaHubPhase: Equatable {
    /// Aucun élément connu, la première page est en route — le squelette.
    case loading
    case loaded
    /// Le réseau manque : ce qui est affiché vient de l'index local.
    case offline
    /// Le serveur a refusé ou échoué, et rien n'est connu localement.
    case failed
}

struct ConversationMediaHubListing: Equatable {
    var items: [ConversationMediaHubItem] = []
    var phase: ConversationMediaHubPhase = .loading
    var canLoadMore = false
    var isLoadingMore = false
    var loadMoreFailed = false

    static let initial = ConversationMediaHubListing()
}

// MARK: - Le modèle

@MainActor
final class ConversationMediaHubViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published private(set) var selectedKind: ConversationMediaKind = .visual
    /// Ce que le segment courant affiche — la recherche quand elle est active.
    @Published private(set) var listing: ConversationMediaHubListing = .initial
    @Published private(set) var activeQuery: String?

    let conversationId: String
    private let messageService: MessageServiceProviding
    private let store: ConversationMediaHubIndexStoring
    private let currentUserId: () -> String
    private let preferredLanguages: () -> [String]
    private let isHidden: (String) -> Bool
    private let now: () -> Date
    private let pageSize: Int
    private let debounce: Duration

    private var segments: [ConversationMediaKind: Segment] = [:]
    private var search: SearchState?
    private var loadTask: Task<Void, Never>?
    private var searchTask: Task<Void, Never>?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "media-hub")

    private enum Cursor: Equatable {
        case head(before: String?)
        case tail(before: String)
        case done
    }

    private struct Segment {
        var carriers: [String: MeeshyMessage] = [:]
        var cursor: Cursor = .head(before: nil)
        var isComplete = false
        var phase: ConversationMediaHubPhase = .loading
        var isLoadingMore = false
        var loadMoreFailed = false
        var opened = false
    }

    private struct SearchState {
        let kind: ConversationMediaKind
        let query: String
        var local: [String: MeeshyMessage] = [:]
        var remote: [String: MeeshyMessage] = [:]
        var before: String?
        var hasMore = false
        var phase: ConversationMediaHubPhase = .loading
        var isLoadingMore = false
        var loadMoreFailed = false
    }

    init(
        conversationId: String,
        messageService: MessageServiceProviding = MessageService.shared,
        store: ConversationMediaHubIndexStoring = CachedConversationMediaHubStore(),
        currentUserId: @escaping () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        preferredLanguages: @escaping () -> [String] = { ReaderPrism.resolve(for: AuthManager.shared.currentUser) },
        isHidden: @escaping (String) -> Bool = { LocallyHiddenMessagesStore.shared.isHidden($0) },
        now: @escaping () -> Date = Date.init,
        pageSize: Int = 30,
        debounce: Duration = .milliseconds(300)
    ) {
        self.conversationId = conversationId
        self.messageService = messageService
        self.store = store
        self.currentUserId = currentUserId
        self.preferredLanguages = preferredLanguages
        self.isHidden = isHidden
        self.now = now
        self.pageSize = pageSize
        self.debounce = debounce
    }

    // MARK: - Segments

    /// Change de segment : un segment déjà vu se repeint aussitôt ; la
    /// recherche en cours se rejoue dans le nouveau.
    func select(_ kind: ConversationMediaKind) {
        selectedKind = kind
        publish()
        if let query = activeQuery {
            searchTask?.cancel()
            searchTask = Task { [weak self] in await self?.runSearch(query) }
        }
        guard segments[kind]?.opened != true else { return }
        loadTask = Task { [weak self] in await self?.open(kind) }
    }

    /// Le chemin ATTENDU d'ouverture d'un segment — cache, puis la tête.
    func open(_ kind: ConversationMediaKind) async {
        guard segments[kind]?.opened != true else { return }
        segments[kind, default: Segment()].opened = true
        let revalidate = await serveCache(kind)
        guard revalidate, !Task.isCancelled else { return publish() }
        await fetchPage(kind)
    }

    /// La liste touche sa fin : une page de plus, jamais deux à la fois.
    func loadMore() {
        Task { [weak self] in await self?.loadMoreNow() }
    }

    func loadMoreNow() async {
        if let search, search.kind == selectedKind {
            guard search.hasMore, !search.isLoadingMore else { return }
            await fetchSearchPage()
            return
        }
        let kind = selectedKind
        guard let segment = segments[kind], segment.cursor != .done, !segment.isLoadingMore, segment.phase != .loading else { return }
        segments[kind]?.isLoadingMore = true
        publish()
        await fetchPage(kind)
    }

    /// Réessaie un segment qui a échoué ou qui est hors ligne.
    func retry() {
        let kind = selectedKind
        segments[kind]?.opened = false
        segments[kind]?.cursor = .head(before: nil)
        let hasItems = segments[kind]?.carriers.isEmpty == false
        segments[kind]?.phase = hasItems ? .loaded : .loading
        publish()
        loadTask = Task { [weak self] in await self?.open(kind) }
    }

    func close() {
        loadTask?.cancel()
        searchTask?.cancel()
    }

    // MARK: - Recherche

    /// La frappe : la recherche part après une courte pause, et chaque frappe
    /// ANNULE la précédente. Sous deux caractères, le segment revient entier.
    func updateQuery(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= MessageService.minimumMediaSearchLength else {
            search = nil
            activeQuery = nil
            return publish()
        }
        let delay = debounce
        searchTask = Task { [weak self] in
            if delay > .zero { try? await Task.sleep(for: delay) }
            guard !Task.isCancelled else { return }
            await self?.runSearch(trimmed)
        }
    }

    /// La recherche elle-même : ce qui est connu répond AUSSITÔT (hors ligne
    /// compris), puis le serveur complète. Ses résultats ne s'écrivent pas
    /// dans l'index persisté — ils y feraient des trous.
    func runSearch(_ query: String) async {
        activeQuery = query
        let kind = selectedKind
        let known = segments[kind]?.carriers.values.filter { ConversationMediaHubRules.matches($0, query: query) } ?? []
        var state = SearchState(kind: kind, query: query)
        state.local = Dictionary(known.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        state.phase = known.isEmpty ? .loading : .loaded
        search = state
        publish()
        await fetchSearchPage()
    }

    private func fetchSearchPage() async {
        guard let current = search else { return }
        if current.before != nil { search?.isLoadingMore = true; publish() }
        do {
            let response = try await messageService.listMedia(
                conversationId: conversationId, kinds: [current.kind], query: current.query,
                before: current.before, limit: pageSize, languages: preferredLanguages()
            )
            guard !Task.isCancelled, search?.query == current.query, search?.kind == current.kind else { return }
            let carriers = convert(response.data)
            for carrier in carriers { search?.remote[carrier.id] = carrier }
            search?.before = response.cursorPagination?.nextCursor ?? carriers.last?.id
            search?.hasMore = Self.hasMore(response, pageCount: carriers.count, pageSize: pageSize)
            search?.phase = .loaded
            search?.loadMoreFailed = false
        } catch {
            guard !Task.isCancelled, search?.query == current.query else { return }
            let hasItems = !(search?.local.isEmpty ?? true) || !(search?.remote.isEmpty ?? true)
            search?.phase = Self.isOffline(error) ? .offline : (hasItems ? .loaded : .failed)
            search?.loadMoreFailed = current.before != nil
            search?.hasMore = false
        }
        search?.isLoadingMore = false
        publish()
    }

    // MARK: - Cache d'abord

    /// Peint l'index du genre et dit s'il reste à revalider : un index FRAIS
    /// et COMPLET se sert tel quel, sans réseau.
    private func serveCache(_ kind: ConversationMediaKind) async -> Bool {
        let cached = await store.load(conversationId: conversationId, kind: kind)
        let complete = await store.isComplete(conversationId: conversationId, kind: kind)
        segments[kind]?.isComplete = complete
        switch cached {
        case .fresh(let carriers, _):
            ingest(carriers, into: kind)
            segments[kind]?.phase = .loaded
            if complete {
                segments[kind]?.cursor = .done
                return false
            }
        case .stale(let carriers, _):
            ingest(carriers, into: kind)
            segments[kind]?.phase = .loaded
        case .expired, .empty:
            segments[kind]?.phase = .loading
        }
        segments[kind]?.cursor = .head(before: nil)
        publish()
        return true
    }

    // MARK: - Réseau ensuite

    private func fetchPage(_ kind: ConversationMediaKind) async {
        guard let segment = segments[kind] else { return }
        let before: String?
        switch segment.cursor {
        case .head(let cursor): before = cursor
        case .tail(let cursor): before = cursor
        case .done:
            segments[kind]?.isLoadingMore = false
            return publish()
        }
        let knownBefore = Set(segment.carriers.keys)
        let response: MessagesAPIResponse
        do {
            response = try await messageService.listMedia(
                conversationId: conversationId, kinds: [kind], query: nil,
                before: before, limit: pageSize, languages: preferredLanguages()
            )
        } catch {
            Self.logger.info("media hub: \(kind.rawValue, privacy: .public) suspendu (\(String(describing: error), privacy: .public))")
            let hasItems = !(segments[kind]?.carriers.isEmpty ?? true)
            let wasPaging = segments[kind]?.isLoadingMore == true
            segments[kind]?.isLoadingMore = false
            segments[kind]?.loadMoreFailed = wasPaging
            segments[kind]?.phase = Self.isOffline(error) ? .offline : (hasItems ? .loaded : .failed)
            return publish()
        }
        guard !Task.isCancelled else { return }
        let carriers = convert(response.data)
        ingest(carriers, into: kind)
        await store.merge(carriers, conversationId: conversationId, kind: kind)

        let hasMore = Self.hasMore(response, pageCount: carriers.count, pageSize: pageSize)
        let oldest = response.cursorPagination?.nextCursor ?? carriers.last?.id
        if hasMore, let oldest {
            let next = nextCursor(
                for: kind, oldestOfPage: oldest,
                metKnown: carriers.contains { knownBefore.contains($0.id) },
                broughtNothing: carriers.allSatisfy { knownBefore.contains($0.id) }
            )
            segments[kind]?.cursor = next
        } else {
            segments[kind]?.cursor = .done
            segments[kind]?.isComplete = true
            await store.markComplete(conversationId: conversationId, kind: kind)
        }
        segments[kind]?.phase = .loaded
        segments[kind]?.isLoadingMore = false
        segments[kind]?.loadMoreFailed = false
        publish()
    }

    /// La TÊTE descend jusqu'au premier porteur déjà connu ; au-delà, l'index
    /// est continu jusqu'à son plus ancien — la QUEUE reprend derrière lui.
    /// Même règle que la galerie (`ConversationMediaCatalog.nextCursor`).
    private func nextCursor(for kind: ConversationMediaKind, oldestOfPage: String,
                            metKnown: Bool, broughtNothing: Bool) -> Cursor {
        guard let segment = segments[kind] else { return .done }
        switch segment.cursor {
        case .head where !metKnown:
            return .head(before: oldestOfPage)
        case .head:
            guard !segment.isComplete,
                  let oldest = segment.carriers.values.min(by: { ConversationMediaHubRules.newestFirst($1, $0) })?.id
            else { return .done }
            return .tail(before: oldest)
        case .tail where !broughtNothing:
            return .tail(before: oldestOfPage)
        case .tail, .done:
            return .done
        }
    }

    // MARK: - Fusion et publication

    private func convert(_ messages: [APIMessage]) -> [MeeshyMessage] {
        let userId = currentUserId()
        let languages = preferredLanguages()
        return messages.map { $0.toMessage(currentUserId: userId, preferredLanguages: languages) }
    }

    private func ingest(_ carriers: [MeeshyMessage], into kind: ConversationMediaKind) {
        for carrier in carriers { segments[kind, default: Segment()].carriers[carrier.id] = carrier }
    }

    private func publish() {
        let kind = selectedKind
        let instant = now()
        if let search, search.kind == kind {
            let carriers = Array(search.local.merging(search.remote) { _, remote in remote }.values)
            listing = ConversationMediaHubListing(
                items: ConversationMediaHubRules.items(of: carriers, kind: kind, now: instant, isHidden: isHidden),
                phase: search.phase,
                canLoadMore: search.hasMore,
                isLoadingMore: search.isLoadingMore,
                loadMoreFailed: search.loadMoreFailed
            )
            return
        }
        let segment = segments[kind] ?? Segment()
        listing = ConversationMediaHubListing(
            items: ConversationMediaHubRules.items(of: Array(segment.carriers.values), kind: kind, now: instant, isHidden: isHidden),
            phase: segment.phase,
            canLoadMore: segment.cursor != .done,
            isLoadingMore: segment.isLoadingMore,
            loadMoreFailed: segment.loadMoreFailed
        )
    }

    /// Le porteur d'un élément affiché — le segment courant, ou sa recherche.
    func carrier(_ messageId: String) -> MeeshyMessage? {
        search?.remote[messageId] ?? search?.local[messageId] ?? segments[selectedKind]?.carriers[messageId]
    }

    /// Les pièces VISUELLES affichées, dans l'ordre de la grille — la
    /// galerie s'ouvre sur elles tant que son propre index n'a rien fusionné.
    var visualAttachments: [MessageAttachment] {
        listing.items.compactMap { $0.kind == .visual ? $0.attachment : nil }
    }

    // MARK: - Règles partagées

    /// `nonisolated` : les stores l'appellent hors de l'acteur principal.
    nonisolated static func union(_ existing: [MeeshyMessage], _ incoming: [MeeshyMessage]) -> [MeeshyMessage] {
        var byId = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for carrier in incoming { byId[carrier.id] = carrier }
        return byId.values.sorted { lhs, rhs in
            lhs.createdAt == rhs.createdAt ? lhs.id < rhs.id : lhs.createdAt < rhs.createdAt
        }
    }

    private static func hasMore(_ response: MessagesAPIResponse, pageCount: Int, pageSize: Int) -> Bool {
        response.cursorPagination?.hasMore ?? response.pagination?.hasMore ?? (pageCount >= pageSize)
    }

    static func isOffline(_ error: Error) -> Bool {
        if error is URLError { return true }
        if case .network = error as? MeeshyError { return true }
        if case .networkError = error as? APIError { return true }
        return false
    }
}
