import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le cercle sur le profil d'un Ami ou d'un Proche (#13940) : le niveau COMMUN que `GET /relations` sert à l'appelant —
/// donc visible des deux seuls —, et la demande du cran suivant quand la loi de demande la laisse proposer.
///
/// - **Cache d'abord** : le même store que « Mes cercles » ; le niveau se peint avant le réseau.
/// - **Rien n'est fabriqué** : sans lien servi (ou sous Connaissance), `shownLevel` est `nil` et le profil garde son
///   badge d'avant.
/// - **Optimiste** : la demande s'applique localement avant la file durable, et se défait si la file y renonce.
@MainActor
final class ProfileCircleViewModel: ObservableObject {

    private static let requestsPage = 50

    let userId: String

    @Published private(set) var link: RelationLink?
    @Published private(set) var pendingLevel: RelationLevel?
    @Published var notice: String?

    private let relations: RelationsProviding
    private let friendService: FriendServiceProviding
    private let offlineQueue: OfflineQueueing
    private let networkMonitor: any NetworkMonitorProviding
    private let now: () -> Date
    private let linksStore: @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink>

    init(
        userId: String,
        relations: RelationsProviding,
        friendService: FriendServiceProviding,
        offlineQueue: OfflineQueueing,
        networkMonitor: any NetworkMonitorProviding,
        now: @escaping () -> Date = { Date() },
        linksStore: @escaping @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink> = CirclesLinkStore.live
    ) {
        self.userId = userId
        self.relations = relations
        self.friendService = friendService
        self.offlineQueue = offlineQueue
        self.networkMonitor = networkMonitor
        self.now = now
        self.linksStore = linksStore
    }

    nonisolated deinit {}

    /// Le niveau commun, Connaissance et au-dessus ; `nil` sinon.
    var shownLevel: RelationLevel? {
        guard let level = link?.effectiveLevel, level >= .acquaintance else { return nil }
        return level
    }

    /// Le cran que l'on peut demander maintenant ; `nil` s'il est verrouillé, au sommet, ou déjà demandé.
    var offeredRaise: RelationLevel? {
        guard pendingLevel == nil, shownLevel != nil, case .available(let target)? = link?.raiseOffer(now: now()) else {
            return nil
        }
        return target
    }

    var summary: String? {
        link.flatMap { CircleProgressSummary.make($0, now: now()).text(levelTitle: CircleLevelNames.title(of:)) }
    }

    func load() async {
        let relations = self.relations
        let userId = self.userId
        let store = await linksStore()
        let loader = CacheFirstLoader(store: store, key: CirclesViewModel.cacheKey, networkMonitor: networkMonitor)
        let fetch: @Sendable () async throws -> [RelationLink] = { try await relations.links() }
        let apply: @MainActor @Sendable ([RelationLink]) -> Void = { [weak self] served in
            self?.link = served.first { $0.userId == userId }
        }
        let revalidation = await loader.load(fetch: fetch, setLoadState: { _ in }, apply: apply)
        await revalidation?.value
        await loadPendingRequest()
    }

    private func loadPendingRequest() async {
        guard pendingLevel == nil,
              let sent = try? await friendService.sentRequests(offset: 0, limit: Self.requestsPage) else { return }
        pendingLevel = sent.data.first { $0.status == "pending" && $0.receiverId == userId }?.requestedLevel
    }

    /// Instantané -> local -> file durable -> retour arrière.
    @discardableResult
    func requestRaise() async -> Bool {
        guard let target = offeredRaise else { return false }
        pendingLevel = target
        do {
            try await CircleRaiseSender(offlineQueue: offlineQueue).send(to: userId, level: target) { [weak self] in
                self?.pendingLevel = nil
                self?.notice = String(localized: "circles.notice.requestFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .main)
                HapticFeedback.error()
            }
            HapticFeedback.success()
            return true
        } catch {
            pendingLevel = nil
            notice = String(localized: "circles.notice.requestFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .main)
            HapticFeedback.error()
            return false
        }
    }
}
