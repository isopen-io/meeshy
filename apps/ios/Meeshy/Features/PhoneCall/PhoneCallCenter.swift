import Combine
import Foundation
import MeeshySDK
import UIKit

/// « EN APPEL » SUR iOS (#18753) — pour toute la durée de l'app, les deux rôles :
///
/// - **l'émetteur** : chaque changement vu par `CXCallObserver`, et une relecture au retour au premier plan (l'app
///   suspendue n'a pas vu la fin), passent par `PhoneCallReporter`, qui ne rapporte qu'un changement, connecté ;
/// - **le Sang** : `phone-call:started` / `phone-call:ended` tiennent l'état cache-first (`PhoneCallStateStore`), et leur
///   annonce, quand la passerelle en sert une, défile dans la SyncPill (`PhoneCallAnnouncementFeed`). Aucun push.
///
/// Le serveur a déjà jugé (cercle, partage) : ce centre ne rejuge rien. Mon propre état ne m'est jamais montré, et un
/// signal n'est JAMAIS un message de conversation. Tout passe par UNE file ordonnée : un événement reçu pendant le
/// rattrapage s'applique après lui, et deux rapports ne se croisent pas.
@MainActor
final class PhoneCallCenter {

    let store: PhoneCallStateStore
    let feed: PhoneCallAnnouncementFeed
    let reporter: PhoneCallReporter

    private let service: PhoneCallServiceProviding
    private let viewerId: () -> String?
    private let displayName: @Sendable @concurrent (String) async -> String?
    private let currentCallActivity: () -> Bool
    private let lane = OrderedEventLane()
    private var account: String?
    /// Avance à chaque changement de compte : un rattrapage parti sous un compte ne s'applique jamais à un autre.
    private var accountGeneration = 0
    private let cacheOwner: PhoneCallCacheOwnerStoring
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        store: PhoneCallStateStore,
        feed: PhoneCallAnnouncementFeed,
        service: PhoneCallServiceProviding,
        viewerId: @escaping () -> String?,
        displayName: @escaping @Sendable @concurrent (String) async -> String?,
        currentCallActivity: @escaping () -> Bool,
        startedEvents: AnyPublisher<PhoneCallStarted, Never> = PhoneCallEvents.started,
        endedEvents: AnyPublisher<PhoneCallEnded, Never> = PhoneCallEvents.ended,
        callChanges: AnyPublisher<Bool, Never>,
        foreground: AnyPublisher<Void, Never>,
        connected: AnyPublisher<Bool, Never>,
        cacheOwner: PhoneCallCacheOwnerStoring = UserDefaultsPhoneCallCacheOwner()
    ) {
        self.cacheOwner = cacheOwner
        self.store = store
        self.feed = feed
        self.service = service
        self.viewerId = viewerId
        self.displayName = displayName
        self.currentCallActivity = currentCallActivity
        self.reporter = PhoneCallReporter(service: service, isSignedIn: { viewerId() != nil })
        let lane = self.lane
        startedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        endedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        connected
            .removeDuplicates()
            .filter { $0 }
            .relay(through: lane) { [weak self] _ in await self?.catchUp() }
            .store(in: &cancellables)
        callChanges
            .relay(through: lane) { [weak self] active in await self?.callActivityChanged(active) }
            .store(in: &cancellables)
        foreground
            .relay(through: lane) { [weak self] _ in await self?.reportCurrentActivity() }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Le Sang

    func receive(_ event: PhoneCallStarted) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement.kind, of: event.userId)
    }

    func receive(_ event: PhoneCallEnded) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement.kind, of: event.userId)
    }

    /// Le rattrapage à chaque socket accrochée : l'instantané fait foi — pour le compte qui l'a demandé, et lui seul.
    /// Un changement de compte pendant la requête jette la réponse : elle porte les Sangs de l'autre compte (audit #18753).
    func catchUp() async {
        let generation = accountGeneration
        let viewer = viewerId()
        guard let items = try? await service.snapshot(), generation == accountGeneration, viewer == viewerId() else { return }
        store.reconcile(with: items.filter { $0.userId != viewer })
    }

    private func announce(_ kind: PhoneCallAnnouncementKind, of userId: String) async {
        let name = await displayName(userId)
        feed.post(userId: userId, kind: kind, label: PhoneCallWording.pillLabel(kind: kind, name: name))
    }

    // MARK: - L'émetteur

    func callActivityChanged(_ active: Bool) async {
        await reporter.observe(active: active)
    }

    /// Relire les appels maintenant : au retour au premier plan, et à l'ouverture d'une session.
    func reportCurrentActivity() async {
        await reporter.observe(active: currentCallActivity())
    }

    // MARK: - Le compte

    /// Le compte change. La déconnexion et le passage à un AUTRE compte oublient l'état des autres et ce qui a été
    /// rapporté ; le premier compte du lancement ne garde le cache (cache d'abord) que s'il en est le PROPRIÉTAIRE —
    /// le cache d'un autre compte, laissé au repos, ne s'affiche jamais. Une session ouverte rapporte l'état des
    /// appels de maintenant.
    func accountChanged(to userId: String?) {
        let previous = account
        account = userId
        guard previous != userId else { return }
        accountGeneration += 1
        if userId == nil || previous != nil || cacheOwner.owner != userId {
            store.reset()
            feed.reset()
        }
        cacheOwner.owner = userId
        reporter.reset()
        guard userId != nil else { return }
        lane.submit { [weak self] in await self?.reportCurrentActivity() }
    }

    /// Attend que la file ait tout joué — pour qu'un témoin lise un état arrêté.
    func settle() async {
        await lane.barrier()
    }
}

extension PhoneCallCenter {

    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = PhoneCallCenter(
        store: .shared,
        feed: .shared,
        service: PhoneCallService.shared,
        viewerId: { AuthManager.shared.currentUser?.id },
        displayName: { userId in await BatteryCenter.cachedDisplayName(of: userId) },
        currentCallActivity: { CallKitCallActivity.shared.isActive },
        callChanges: CallKitCallActivity.shared.changes,
        foreground: NotificationCenter.default
            .publisher(for: UIApplication.willEnterForegroundNotification)
            .map { _ in () }
            .eraseToAnyPublisher(),
        connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher()
    )

    private static var accountWatch: AnyCancellable?

    /// Dès l'ouverture de l'app : l'émetteur suit la session, le Sang écoute, et tout s'oublie au changement de compte.
    static func start() {
        guard accountWatch == nil else { return }
        let center = shared
        accountWatch = AuthManager.shared.currentUserPublisher
            .map { $0?.id }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { userId in center.accountChanged(to: userId) }
    }
}

/// Le compte à qui appartient le cache « en appel » rangé au repos : un autre compte qui ouvre l'app à froid ne lit
/// jamais les appels des Sangs du précédent.
protocol PhoneCallCacheOwnerStoring: AnyObject {
    var owner: String? { get set }
}

final class UserDefaultsPhoneCallCacheOwner: PhoneCallCacheOwnerStoring {
    private let key = "me.meeshy.phoneCall.cacheOwner"

    var owner: String? {
        get { UserDefaults.standard.string(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
