import Combine
import Foundation
import MeeshySDK
import UIKit
import UserNotifications

/// LA BATTERIE DES PROCHES SUR iOS (#14147) — pour toute la durée de l'app, les deux rôles :
///
/// - **émetteur** : le téléphone relève sa batterie selon `BatteryReportCadence` tant que l'app a du temps
///   d'exécution, et relève MAINTENANT sur `battery:pull-requested` (le push silencieux passe par `reportNow`) ;
/// - **lecteur** : `battery:changed` / `battery:cleared` tiennent l'état cache-first (`BatteryStateStore`), et leur
///   annonce, quand la passerelle en sert une, défile dans la SyncPill (`BatteryAnnouncementFeed`). Le push
///   `device_battery` reçu app ouverte devient la même annonce, sans bannière.
///
/// Le serveur a déjà jugé (cercle, consentement, mode de réception) : ce centre ne rejuge rien et n'avance jamais
/// l'épisode.
@MainActor
final class BatteryCenter {

    let store: BatteryStateStore
    let feed: BatteryAnnouncementFeed
    let reporter: BatteryReportingProviding

    private let viewerId: () -> String?
    private let snapshot: @Sendable @concurrent () async throws -> [BatteryReaderState]
    private let displayName: @Sendable @concurrent (String) async -> String?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        store: BatteryStateStore,
        feed: BatteryAnnouncementFeed,
        reporter: BatteryReportingProviding,
        viewerId: @escaping () -> String?,
        snapshot: @escaping @Sendable @concurrent () async throws -> [BatteryReaderState],
        displayName: @escaping @Sendable @concurrent (String) async -> String?,
        changedEvents: AnyPublisher<BatteryChanged, Never> = BatteryEvents.changed,
        clearedEvents: AnyPublisher<BatteryCleared, Never> = BatteryEvents.cleared,
        pullRequests: AnyPublisher<BatteryPullRequested, Never> = BatteryEvents.pullRequested,
        connected: AnyPublisher<Bool, Never>
    ) {
        self.store = store
        self.feed = feed
        self.reporter = reporter
        self.viewerId = viewerId
        self.snapshot = snapshot
        self.displayName = displayName
        let lane = OrderedEventLane()
        changedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        clearedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        pullRequests
            .relay(through: lane) { [weak self] _ in await self?.reportNow() }
            .store(in: &cancellables)
        connected
            .removeDuplicates()
            .filter { $0 }
            .relay(through: lane) { [weak self] _ in await self?.catchUp() }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Lecteur

    func receive(_ event: BatteryChanged) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement, of: event.userId)
    }

    func receive(_ event: BatteryCleared) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement, of: event.userId)
    }

    /// Le rattrapage à chaque socket accrochée : l'instantané fait foi.
    func catchUp() async {
        guard let items = try? await snapshot() else { return }
        store.reconcile(with: items.filter { $0.userId != viewerId() })
    }

    /// Le push `device_battery` reçu app ouverte : il passe dans la SyncPill, avec les mots que le serveur a déjà
    /// servis dans la langue du lecteur.
    func announce(push content: BatteryPushContent) {
        feed.post(userId: content.userId, kind: content.kind, label: content.label)
    }

    private func announce(_ announcement: BatteryAnnouncement, of userId: String) async {
        let name = await displayName(userId) ?? BatteryAnnouncementWording.someoneClose
        let label = BatteryAnnouncementWording.label(
            kind: announcement.kind, name: name, level: announcement.level, threshold: announcement.threshold
        )
        feed.post(userId: userId, kind: announcement.kind, label: label)
    }

    // MARK: - Émetteur

    @discardableResult
    func reportNow() async -> BatteryReportOutcome {
        await reporter.reportNow()
    }

    /// Le compte change : l'état des autres ne survit pas au compte, l'émetteur suit la session.
    func accountChanged(to userId: String?) {
        guard userId != nil else {
            reporter.stop()
            store.reset()
            feed.reset()
            return
        }
        reporter.start()
    }
}

/// Ce qu'un push `device_battery` apporte à la SyncPill.
nonisolated struct BatteryPushContent: Equatable, Sendable {
    let userId: String
    let kind: BatteryAnnouncementKind?
    let label: String

    /// `nil` pour tout autre push. Le libellé est le titre et le corps que la passerelle a composés pour CE lecteur.
    init?(userInfo: [AnyHashable: Any], title: String, body: String) {
        guard userInfo["type"] as? String == BatteryContract.notificationType else { return nil }
        let metadata = userInfo["metadata"] as? [String: Any]
        let userId = (userInfo["userId"] as? String) ?? (metadata?["userId"] as? String) ?? (userInfo["actorId"] as? String)
        let rawKind = (userInfo["batteryKind"] as? String) ?? (metadata?["batteryKind"] as? String)
        let parts = [title, body].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !parts.isEmpty else { return nil }
        self.userId = userId ?? "push"
        self.kind = rawKind.flatMap(BatteryAnnouncementKind.init(rawValue:))
        self.label = parts.joined(separator: " · ")
    }
}

extension BatteryCenter {

    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = BatteryCenter(
        store: .shared,
        feed: .shared,
        reporter: BatteryReporter(device: UIDeviceBatteryReader.shared, sender: BatterySocketReportSender.shared),
        viewerId: { AuthManager.shared.currentUser?.id },
        snapshot: { try await BatteryService.shared.snapshot() },
        displayName: { userId in await BatteryCenter.cachedDisplayName(of: userId) },
        connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher()
    )

    private static var accountWatch: AnyCancellable?

    /// Dès l'ouverture de l'app : l'émetteur suit la session, le lecteur écoute.
    static func start() {
        guard accountWatch == nil else { return }
        let center = shared
        accountWatch = AuthManager.shared.currentUserPublisher
            .map { $0?.id }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { userId in center.accountChanged(to: userId) }
    }

    /// Le nom d'une personne tel que la liste de conversations le connaît déjà (le direct avec elle).
    nonisolated static func cachedDisplayName(of userId: String) async -> String? {
        let result = await CacheCoordinator.shared.conversations.load(for: "list")
        guard let conversations = result.snapshot() else { return nil }
        let match = conversations.first { $0.type == .direct && $0.participantUserId == userId }
        return match?.displayName
    }

    /// Le push `device_battery` app ouverte : la SyncPill le dit, aucune bannière. Rend `false` pour tout autre push.
    nonisolated static func routesForegroundPush(_ content: UNNotificationContent) -> Bool {
        guard let push = BatteryPushContent(userInfo: content.userInfo, title: content.title, body: content.body) else {
            return content.userInfo["type"] as? String == BatteryContract.notificationType
        }
        Task { @MainActor in shared.announce(push: push) }
        return true
    }

    nonisolated static func handlesPullPush(_ userInfo: [AnyHashable: Any]) -> Bool {
        userInfo["type"] as? String == BatteryContract.pullPushType
    }

    /// Le push silencieux `battery_pull` : relever MAINTENANT, hors cadence (la socket si elle est là, sinon REST),
    /// puis rendre la main à iOS. Rend `false` pour tout autre push.
    nonisolated static func handledPullWake(
        _ userInfo: [AnyHashable: Any],
        completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) -> Bool {
        guard handlesPullPush(userInfo) else { return false }
        Task { @MainActor in
            let outcome = await shared.reportNow()
            completionHandler(outcome == .tracked || outcome == .ignored ? .newData : .noData)
        }
        return true
    }
}
