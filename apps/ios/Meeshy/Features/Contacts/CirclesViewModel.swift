import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// « Mes cercles » (#13938) : mes liens par niveau, ce qui manque pour monter, mes demandes de montée.
///
/// - **Cache d'abord** : la liste se peint depuis le disque, jamais un spinner sur un cache non vide ; le squelette
///   n'existe que sur cache vide.
/// - **Optimiste** : une demande de montée s'applique localement AVANT le réseau (instantané -> local -> file durable
///   -> retour arrière si la file renonce).
/// - **Le client ne décide pas** : la loi de demande (`RelationRequestRule`) sert à ne pas PROPOSER ce que le serveur
///   refusera ; il reste l'autorité (409 `RELATION_PHASE_SKIP|COOLDOWN|NOT_ELIGIBLE`).
@MainActor
final class CirclesViewModel: ObservableObject {

    static let cacheKey = "relations:links"

    /// Les niveaux qu'on liste, du plus proche au plus lointain. Public et Communauté ne sont pas des liens : ils
    /// ne se listent pas.
    static let displayedLevels: [RelationLevel] = [.blood, .close, .friend, .acquaintance]

    private static let requestsPage = 50

    struct Row: Identifiable, Equatable {
        let link: RelationLink
        let person: CirclePerson?
        var id: String { link.userId }
    }

    struct Section: Identifiable, Equatable {
        let level: RelationLevel
        let rows: [Row]
        var id: RelationLevel { level }
    }

    @Published private(set) var links: [RelationLink] = []
    @Published private(set) var people: [String: CirclePerson] = [:]
    @Published private(set) var config: RelationsConfig?
    @Published private(set) var loadState: LoadState = .idle
    @Published private(set) var incomingRaises: [FriendRequest] = []
    @Published private(set) var outgoingRaises: [FriendRequest] = []
    @Published private(set) var pendingTargets: [String: RelationLevel] = [:]
    @Published var ritualTarget: CircleRitualTarget?
    @Published var notice: String?

    private let relations: RelationsProviding
    private let friendService: FriendServiceProviding
    private let peopleResolver: CirclePeopleResolving
    private let offlineQueue: OfflineQueueing
    private let networkMonitor: any NetworkMonitorProviding
    private let languageCode: String
    private let now: () -> Date
    private let linksStore: @Sendable () async -> GRDBCacheStore<String, RelationLink>
    private var revalidationTask: Task<Void, Never>?
    private var levelSubscription: AnyCancellable?

    /// Les singletons de production sont injectés par `init()` (`CirclesLive.swift`) : un ViewModel ne nomme pas
    /// `.shared`, et chaque dépendance se remplace par un double de test.
    init(
        relations: RelationsProviding,
        friendService: FriendServiceProviding,
        people: CirclePeopleResolving,
        offlineQueue: OfflineQueueing,
        networkMonitor: any NetworkMonitorProviding,
        languageCode: String = CirclesViewModel.interfaceLanguageCode,
        now: @escaping () -> Date = { Date() },
        linksStore: @escaping @Sendable () async -> GRDBCacheStore<String, RelationLink> = CirclesLinkStore.live,
        levelEvents: AnyPublisher<RelationLevelRaisedEvent, Never> = RelationEvents.levelRaised
    ) {
        self.relations = relations
        self.friendService = friendService
        self.peopleResolver = people
        self.offlineQueue = offlineQueue
        self.networkMonitor = networkMonitor
        self.languageCode = languageCode
        self.now = now
        self.linksStore = linksStore
        levelSubscription = levelEvents
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                Task { @MainActor in await self?.receive(levelRaised: event) }
            }
    }

    nonisolated deinit {
        revalidationTask?.cancel()
    }

    static var interfaceLanguageCode: String {
        let preferred = Locale.preferredLanguages.first ?? "fr"
        return Locale(identifier: preferred).language.languageCode?.identifier ?? "fr"
    }

    // MARK: - Lecture

    /// Les liens qui se listent : Connaissance et au-dessus.
    var visibleLinks: [RelationLink] {
        links.filter { $0.effectiveLevel >= .acquaintance }
    }

    var visibleLinkCount: Int { visibleLinks.count }

    var sections: [Section] {
        let visible = visibleLinks
        return Self.displayedLevels.compactMap { level in
            let rows = visible
                .filter { $0.effectiveLevel == level }
                .map { Row(link: $0, person: people[$0.userId]) }
                .sorted { Self.sortKey($0) < Self.sortKey($1) }
            return rows.isEmpty ? nil : Section(level: level, rows: rows)
        }
    }

    private static func sortKey(_ row: Row) -> String {
        (row.person?.name ?? "\u{FFFF}").lowercased() + row.id
    }

    /// Squelette : cache FROID et rien encore peint — jamais un spinner sur un cache non vide.
    var showsSkeleton: Bool {
        visibleLinks.isEmpty && loadState == .loading
    }

    var isEmptyState: Bool {
        guard visibleLinks.isEmpty else { return false }
        return loadState == .loaded || loadState == .cachedFresh || loadState == .cachedStale
    }

    var isOffline: Bool { loadState == .offline }

    var errorMessage: String? {
        guard case .error = loadState else { return nil }
        return String(localized: "circles.error.load", defaultValue: "Impossible de charger tes cercles", bundle: .main)
    }

    func title(of level: RelationLevel) -> String {
        config?.label(for: level, language: languageCode) ?? CircleLevelNames.title(of: level)
    }

    func icon(of level: RelationLevel) -> String {
        config?.icon(for: level) ?? CircleLevelNames.icon(of: level)
    }

    /// Le cran que j'ai demandé à cette personne et qui attend sa réponse : l'optimiste d'abord, puis la demande servie.
    func pendingLevel(for userId: String) -> RelationLevel? {
        pendingTargets[userId] ?? outgoingRaises.first { $0.receiverId == userId }?.requestedLevel
    }

    func name(of userId: String, fallback: String? = nil) -> String {
        people[userId]?.name ?? fallback ?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main)
    }

    // MARK: - Chargement

    func load(forceNetwork: Bool = false) async {
        let relations = self.relations
        let store = await linksStore()
        let loader = CacheFirstLoader(store: store, key: Self.cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()
        let fetch: @Sendable () async throws -> [RelationLink] = { try await relations.links() }
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { [weak self] state in
            self?.loadState = state
        }
        let apply: @MainActor @Sendable ([RelationLink]) -> Void = { [weak self] served in
            self?.links = served
        }
        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
        } else {
            revalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
        }
        await resolveMissingPeople()
        await revalidationTask?.value
        await resolveMissingPeople()
        await loadRequests()
        await loadConfig()
    }

    private func resolveMissingPeople() async {
        let unresolved = visibleLinks.map(\.userId).filter { people[$0] == nil }
        guard !unresolved.isEmpty else { return }
        let resolved = await peopleResolver.people(for: unresolved)
        people.merge(resolved) { _, new in new }
    }

    private func loadRequests() async {
        let linked = Set(visibleLinks.map(\.userId))
        if let received = try? await friendService.receivedRequests(offset: 0, limit: Self.requestsPage) {
            incomingRaises = received.data.filter { $0.status == "pending" && linked.contains($0.senderId) }
        }
        if let sent = try? await friendService.sentRequests(offset: 0, limit: Self.requestsPage) {
            outgoingRaises = sent.data.filter { $0.status == "pending" && linked.contains($0.receiverId) }
        }
    }

    private func loadConfig() async {
        if let served = try? await relations.config() { config = served }
    }

    // MARK: - Demander un cran (optimiste)

    /// Instantané -> local -> file durable -> retour arrière. La demande part par l'outbox (`.sendFriendRequest` +
    /// `targetLevel`) : hors ligne elle attend la reconnexion, et la file rend `.exhausted` si le serveur la refuse
    /// pour de bon (saut de phase, inéligibilité) — l'état local est alors défait.
    @discardableResult
    func requestRaise(_ link: RelationLink) async -> Bool {
        guard case .available(let target) = link.raiseOffer(now: now()), pendingLevel(for: link.userId) == nil else {
            return false
        }
        let snapshot = pendingTargets
        pendingTargets[link.userId] = target
        let cmid = ClientMutationId.generate()
        observeRaiseOutcome(cmid: cmid, userId: link.userId)
        let payload = SendFriendRequestPayload(clientMutationId: cmid, targetUserId: link.userId, targetLevel: target.rawValue)
        do {
            try await offlineQueue.enqueue(.sendFriendRequest, payload: payload, conversationId: nil)
            HapticFeedback.success()
            return true
        } catch {
            pendingTargets = snapshot
            notice = String(localized: "circles.notice.requestFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .main)
            HapticFeedback.error()
            return false
        }
    }

    private func observeRaiseOutcome(cmid: String, userId: String) {
        let queue = offlineQueue
        Task { @MainActor [weak self] in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                guard case .exhausted = event, let self else { continue }
                self.pendingTargets[userId] = nil
                self.notice = String(localized: "circles.notice.requestFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .main)
                HapticFeedback.error()
            }
        }
    }

    // MARK: - Répondre à une demande de montée

    /// Une demande de SANG ne s'accepte pas par `PATCH accept` (le serveur répond `RELATION_RITUAL_REQUIRED`) :
    /// on ouvre le rituel, qui est le seul chemin vers le Sang. La demande reste affichée jusqu'au scellement.
    func accept(_ request: FriendRequest) async {
        if request.requestedLevel == .blood {
            openRitual(with: request.senderId, fallbackName: request.sender?.name)
            return
        }
        await respond(to: request, action: .accept)
    }

    func decline(_ request: FriendRequest) async {
        await respond(to: request, action: .reject)
    }

    func openRitual(with userId: String, fallbackName: String? = nil) {
        ritualTarget = CircleRitualTarget(userId: userId, name: name(of: userId, fallback: fallbackName))
    }

    private func respond(to request: FriendRequest, action: RespondFriendRequestPayload.Action) async {
        let snapshot = incomingRaises
        incomingRaises.removeAll { $0.id == request.id }
        let cmid = ClientMutationId.generate()
        observeRespondOutcome(cmid: cmid, request: request)
        let payload = RespondFriendRequestPayload(clientMutationId: cmid, friendRequestId: request.id, action: action)
        do {
            try await offlineQueue.enqueue(.respondFriendRequest, payload: payload, conversationId: nil)
            HapticFeedback.success()
        } catch {
            incomingRaises = snapshot
            notice = String(localized: "circles.notice.respondFailed", defaultValue: "Impossible de répondre à la demande", bundle: .main)
            HapticFeedback.error()
        }
    }

    private func observeRespondOutcome(cmid: String, request: FriendRequest) {
        let queue = offlineQueue
        Task { @MainActor [weak self] in
            let stream = await queue.outcomeStream(for: cmid)
            for await event in stream {
                guard case .exhausted = event, let self else { continue }
                if !self.incomingRaises.contains(where: { $0.id == request.id }) {
                    self.incomingRaises = (self.incomingRaises + [request]).sorted { $0.createdAt > $1.createdAt }
                }
                self.notice = String(localized: "circles.notice.respondFailed", defaultValue: "Impossible de répondre à la demande", bundle: .main)
                HapticFeedback.error()
            }
        }
    }

    /// Retirer une demande que j'ai envoyée : `action=dismiss`, en direct (elle suppose le réseau).
    func cancel(_ request: FriendRequest) async {
        let snapshot = outgoingRaises
        outgoingRaises.removeAll { $0.id == request.id }
        do {
            try await friendService.deleteRequest(requestId: request.id)
            HapticFeedback.light()
        } catch {
            outgoingRaises = snapshot
            notice = String(localized: "circles.notice.cancelFailed", defaultValue: "Impossible d'annuler la demande", bundle: .main)
            HapticFeedback.error()
        }
    }

    // MARK: - Événements du lien

    /// Le niveau effectif a monté : ma demande est soldée, on relit les cercles.
    func receive(levelRaised event: RelationLevelRaisedEvent) async {
        pendingTargets[event.userId] = nil
        await load(forceNetwork: true)
    }

    /// Le rituel s'est refermé (scellé ou abandonné) : la feuille part, les cercles se relisent.
    func ritualFinished() async {
        ritualTarget = nil
        await load(forceNetwork: true)
    }
}
