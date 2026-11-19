import Combine
import Foundation
import MeeshySDK

/// LA VÉRIFICATION D'INACTIVITÉ SUR iOS (#18738) — pour toute la durée de l'app, les deux rôles :
///
/// - **la personne** : « Tout va bien ? » se répond par l'action « Je vais bien » ou le toucher de la bannière
///   (`answerWellness`, `POST /me/wellness/ok`) ; l'app ouverte sur le téléphone suivi est déjà, côté passerelle, une
///   activité ;
/// - **le Sang** : `inactivity:alert` / `inactivity:cleared` tiennent l'état cache-first (`InactivityAlertStateStore`),
///   et leur annonce, quand la passerelle en sert une, défile dans la SyncPill (`InactivityAnnouncementFeed`).
///
/// Le serveur a déjà jugé (cercle, partage, délai) : ce centre ne rejuge rien. Mon propre état ne m'est jamais montré.
/// Un signal n'est JAMAIS un message de conversation.
@MainActor
final class InactivityCheckCenter {

    let store: InactivityAlertStateStore
    let feed: InactivityAnnouncementFeed

    private let service: InactivityCheckServiceProviding
    private let viewerId: () -> String?
    private let displayName: @Sendable @concurrent (String) async -> String?
    private let now: () -> Date
    private var pendingAnswer: Task<WellnessAnswerOutcome, Never>?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        store: InactivityAlertStateStore,
        feed: InactivityAnnouncementFeed,
        service: InactivityCheckServiceProviding,
        viewerId: @escaping () -> String?,
        displayName: @escaping @Sendable @concurrent (String) async -> String?,
        now: @escaping () -> Date = { Date() },
        alertEvents: AnyPublisher<InactivityAlertRaised, Never> = InactivityEvents.alert,
        clearedEvents: AnyPublisher<InactivityAlertCleared, Never> = InactivityEvents.cleared,
        connected: AnyPublisher<Bool, Never>
    ) {
        self.store = store
        self.feed = feed
        self.service = service
        self.viewerId = viewerId
        self.displayName = displayName
        self.now = now
        let lane = OrderedEventLane()
        alertEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        clearedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        connected
            .removeDuplicates()
            .filter { $0 }
            .relay(through: lane) { [weak self] _ in await self?.catchUp() }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Le Sang

    func receive(_ event: InactivityAlertRaised) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement.kind, of: event.userId)
    }

    func receive(_ event: InactivityAlertCleared) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard let announcement = event.announcement else { return }
        await announce(announcement.kind, of: event.userId)
    }

    /// Le rattrapage à chaque socket accrochée : l'instantané fait foi.
    func catchUp() async {
        guard let items = try? await service.snapshot() else { return }
        let viewer = viewerId()
        store.reconcile(with: items.filter { $0.userId != viewer })
    }

    private func announce(_ kind: InactivityAnnouncementKind, of userId: String) async {
        let name = await displayName(userId)
        feed.post(userId: userId, kind: kind, label: InactivityCheckWording.pillLabel(kind: kind, name: name))
    }

    // MARK: - La personne

    /// « Je vais bien ». Le toucher de la bannière et l'action peuvent arriver ensemble : une seule requête part, les
    /// deux reçoivent sa réponse.
    @discardableResult
    func answerWellness() async -> WellnessAnswerOutcome {
        if let pendingAnswer { return await pendingAnswer.value }
        let service = self.service
        let answer = Task { await service.answerWellness() }
        pendingAnswer = answer
        let outcome = await answer.value
        pendingAnswer = nil
        return outcome
    }

    /// Le compte change : l'alerte des autres ne survit pas au compte.
    func accountChanged(to userId: String?) {
        guard userId == nil else { return }
        store.reset()
        feed.reset()
    }
}

extension InactivityCheckCenter {

    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = InactivityCheckCenter(
        store: .shared,
        feed: .shared,
        service: InactivityCheckService.shared,
        viewerId: { AuthManager.shared.currentUser?.id },
        displayName: { userId in await BatteryCenter.cachedDisplayName(of: userId) },
        connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher()
    )

    private static var accountWatch: AnyCancellable?

    /// Dès l'ouverture de l'app : le Sang écoute, et oublie tout à la déconnexion.
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
