import Combine
import Foundation
import MeeshySDK
import UIKit
import UserNotifications

/// LE TÉLÉPHONE INJOIGNABLE SUR iOS (#18737) — pour toute la durée de l'app, les deux rôles :
///
/// - **émetteur** : le push silencieux `device_probe` réveille l'app, qui répond `POST /me/device/alive` (`answerProbe`) ;
///   la socket ouverte et le relevé de batterie sont déjà, côté passerelle, des signes de vie ;
/// - **lecteur** : `phone:unreachable` / `phone:reachable` tiennent l'état cache-first (`PhoneReachabilityStateStore`),
///   et leur annonce, quand la passerelle en sert une, défile dans la SyncPill (`PhoneReachabilityAnnouncementFeed`).
///   Le push `device_unreachable` reçu app ouverte devient la même annonce, sans bannière.
///
/// Le serveur a déjà jugé (cercle, consentement, sondes) : ce centre ne rejuge rien. Mon propre état ne m'est jamais
/// montré.
@MainActor
final class PhoneReachabilityCenter {

    let store: PhoneReachabilityStateStore
    let feed: PhoneReachabilityAnnouncementFeed

    private let service: PhoneReachabilityServiceProviding
    private let viewerId: () -> String?
    private let displayName: @Sendable @concurrent (String) async -> String?
    private let now: () -> Date
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        store: PhoneReachabilityStateStore,
        feed: PhoneReachabilityAnnouncementFeed,
        service: PhoneReachabilityServiceProviding,
        viewerId: @escaping () -> String?,
        displayName: @escaping @Sendable @concurrent (String) async -> String?,
        now: @escaping () -> Date = { Date() },
        unreachableEvents: AnyPublisher<PhoneReachabilityChanged, Never> = PhoneReachabilityEvents.unreachable,
        reachableEvents: AnyPublisher<PhoneReachabilityCleared, Never> = PhoneReachabilityEvents.reachable,
        connected: AnyPublisher<Bool, Never>
    ) {
        self.store = store
        self.feed = feed
        self.service = service
        self.viewerId = viewerId
        self.displayName = displayName
        self.now = now
        let lane = OrderedEventLane()
        unreachableEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        reachableEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        connected
            .removeDuplicates()
            .filter { $0 }
            .relay(through: lane) { [weak self] _ in await self?.catchUp() }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Lecteur

    func receive(_ event: PhoneReachabilityChanged) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement.kind, of: event.userId, since: event.state.unreachableSince)
    }

    func receive(_ event: PhoneReachabilityCleared) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement.kind, of: event.userId, since: nil)
    }

    /// Le rattrapage à chaque socket accrochée : l'instantané fait foi.
    func catchUp() async {
        guard let items = try? await service.snapshot() else { return }
        let viewer = viewerId()
        store.reconcile(with: items.filter { $0.userId != viewer })
    }

    /// Le push `device_unreachable` reçu app ouverte : il passe dans la SyncPill, avec les mots que le serveur a déjà
    /// servis dans la langue du lecteur.
    func announce(push content: PhoneReachabilityPushContent) {
        feed.post(userId: content.userId, kind: content.kind, label: content.label)
    }

    private func announce(_ kind: PhoneReachabilityAnnouncementKind, of userId: String, since: Date?) async {
        let name = await displayName(userId)
        let label = PhoneReachabilityWording.pillLabel(kind: kind, name: name, since: since, now: now())
        feed.post(userId: userId, kind: kind, label: label)
    }

    // MARK: - Émetteur

    /// La réponse à une sonde : le téléphone est joignable.
    @discardableResult
    func answerProbe() async -> PhoneAliveOutcome {
        await service.alive()
    }

    /// Le compte change : l'état des autres ne survit pas au compte.
    func accountChanged(to userId: String?) {
        guard userId == nil else { return }
        store.reset()
        feed.reset()
    }
}

/// Ce qu'un push `device_unreachable` apporte à la SyncPill.
nonisolated struct PhoneReachabilityPushContent: Equatable, Sendable {
    let userId: String
    let kind: PhoneReachabilityAnnouncementKind?
    let label: String

    /// `nil` pour tout autre push. Le libellé est le titre et le corps que la passerelle a composés pour CE lecteur.
    init?(userInfo: [AnyHashable: Any], title: String, body: String) {
        guard userInfo["type"] as? String == PhoneReachabilityContract.notificationType else { return nil }
        let metadata = userInfo["metadata"] as? [String: Any]
        let userId = (userInfo["userId"] as? String) ?? (metadata?["userId"] as? String) ?? (userInfo["actorId"] as? String)
        let rawKind = (userInfo["reachabilityKind"] as? String) ?? (metadata?["reachabilityKind"] as? String)
        let parts = [title, body].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !parts.isEmpty else { return nil }
        self.userId = userId ?? "push"
        self.kind = rawKind.flatMap(PhoneReachabilityAnnouncementKind.init(rawValue:))
        self.label = parts.joined(separator: " · ")
    }
}

extension PhoneReachabilityCenter {

    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = PhoneReachabilityCenter(
        store: .shared,
        feed: .shared,
        service: PhoneReachabilityService.shared,
        viewerId: { AuthManager.shared.currentUser?.id },
        displayName: { userId in await BatteryCenter.cachedDisplayName(of: userId) },
        connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher()
    )

    private static var accountWatch: AnyCancellable?

    /// Dès l'ouverture de l'app : le lecteur écoute, et oublie tout à la déconnexion.
    static func start() {
        guard accountWatch == nil else { return }
        let center = shared
        accountWatch = AuthManager.shared.currentUserPublisher
            .map { $0?.id }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { userId in center.accountChanged(to: userId) }
    }

    /// Le push `device_unreachable` app ouverte : la SyncPill le dit, aucune bannière. Rend `false` pour tout autre push.
    nonisolated static func routesForegroundPush(_ content: UNNotificationContent) -> Bool {
        guard let push = PhoneReachabilityPushContent(userInfo: content.userInfo, title: content.title, body: content.body) else {
            return content.userInfo["type"] as? String == PhoneReachabilityContract.notificationType
        }
        Task { @MainActor in shared.announce(push: push) }
        return true
    }

    nonisolated static func handlesProbePush(_ userInfo: [AnyHashable: Any]) -> Bool {
        userInfo["type"] as? String == PhoneReachabilityContract.probePushType
    }

    /// Le push silencieux `device_probe` : répondre MAINTENANT par `POST /me/device/alive`, puis rendre la main à iOS.
    /// Rend `false` pour tout autre push.
    static func handledProbeWake(
        _ userInfo: [AnyHashable: Any],
        completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) -> Bool {
        guard handlesProbePush(userInfo) else { return false }
        Task { @MainActor in
            let outcome = await shared.answerProbe()
            completionHandler(outcome == .failed ? .failed : .newData)
        }
        return true
    }
}
