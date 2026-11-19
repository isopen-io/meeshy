import Combine
import Foundation
import MeeshySDK
import UIKit

/// LA CHUTE DÉTECTÉE SUR iOS (#18748) — pour toute la durée de l'app, les deux rôles :
///
/// - **l'émetteur** : avec son ACCORD EXPLICITE seulement (`GET /me/health/fall/settings`), la source HealthKit livre
///   chaque échantillon neuf de `numberOfTimesFallen` ; `FallReportPlanner` dit lesquels rapporter (`POST
///   /me/health/fall`), et un 403 (accord retiré ailleurs) coupe l'observateur. Pendant l'épisode qu'il a rapporté, la
///   bannière « Une chute a été détectée — tout va bien ? » lui offre « Je vais bien » ;
/// - **le Sang** : `fall:detected` / `fall:cleared` tiennent l'état cache-first (`FallStateStore`), la levée poussée
///   (`safety_alert_cleared`) le retire aussi, et l'annonce défile dans la SyncPill (`FallAnnouncementFeed`).
///
/// Le serveur a déjà jugé (accord, âge, cercles) : ce centre ne rejuge rien. Ma propre chute ne m'est jamais montrée
/// comme celle d'un Sang. Un signal n'est JAMAIS un message de conversation. Tout passe par UNE file ordonnée.
@MainActor
final class FallDetectionCenter: ObservableObject {

    let store: FallStateStore
    let feed: FallAnnouncementFeed

    /// L'instant de la chute que j'ai rapportée, tant que son épisode court — EN MÉMOIRE seulement : un instant de
    /// chute est une donnée de santé, il ne se range pas sur le disque.
    @Published private(set) var ownEpisodeDetectedAt: Date?
    @Published private(set) var isObserving = false

    private let service: FallDetectionServiceProviding
    private let source: FallSampleSourcing
    private let viewerId: () -> String?
    private let displayName: @Sendable @concurrent (String) async -> String?
    private let now: () -> Date
    private let lane = OrderedEventLane()
    private let cacheOwner: FallCacheOwnerStoring
    private var account: String?
    /// Avance à chaque changement de compte : un rattrapage parti sous un compte ne s'applique jamais à un autre.
    private var accountGeneration = 0
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        store: FallStateStore,
        feed: FallAnnouncementFeed,
        service: FallDetectionServiceProviding,
        source: FallSampleSourcing,
        viewerId: @escaping () -> String?,
        displayName: @escaping @Sendable @concurrent (String) async -> String?,
        now: @escaping () -> Date = { Date() },
        detectedEvents: AnyPublisher<FallDetected, Never> = FallEvents.detected,
        clearedEvents: AnyPublisher<FallCleared, Never> = FallEvents.cleared,
        connected: AnyPublisher<Bool, Never>,
        cacheOwner: FallCacheOwnerStoring = UserDefaultsFallCacheOwner()
    ) {
        self.store = store
        self.feed = feed
        self.service = service
        self.source = source
        self.viewerId = viewerId
        self.displayName = displayName
        self.now = now
        self.cacheOwner = cacheOwner
        let lane = self.lane
        detectedEvents
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

    /// L'épisode que j'ai rapporté court-il encore ? Passé sa durée de vie, la bannière ne demande plus rien.
    var ownEpisodeOpen: Bool {
        guard let detectedAt = ownEpisodeDetectedAt else { return false }
        return now().timeIntervalSince(detectedAt) < FallDetectionContract.episodeTtl
    }

    // MARK: - Le Sang

    func receive(_ event: FallDetected) async {
        guard event.userId != viewerId() else { return }
        store.apply(event)
        guard event.announcedAt != nil else { return }
        await announce(.detected, of: event.userId)
    }

    func receive(_ event: FallCleared) async {
        guard event.userId != viewerId() else { return }
        store.clear(userId: event.userId)
        guard event.reason == .responded else { return }
        await announce(.responded, of: event.userId)
    }

    /// La levée poussée (`safety_alert_cleared`, même `collapseId` que l'alerte) : l'état disparaît comme à `fall:cleared`.
    func receivePushedClearing(userId: String) {
        guard userId != viewerId() else { return }
        store.clear(userId: userId)
    }

    /// Le rattrapage à chaque socket accrochée : l'instantané fait foi — pour le compte qui l'a demandé, et lui seul.
    func catchUp() async {
        let generation = accountGeneration
        let viewer = viewerId()
        guard let items = try? await service.snapshot(), generation == accountGeneration, viewer == viewerId() else { return }
        store.reconcile(with: items.filter { $0.userId != viewer })
    }

    private func announce(_ kind: FallAnnouncementKind, of userId: String) async {
        let name = await displayName(userId)
        feed.post(userId: userId, kind: kind, label: FallDetectionWording.pillLabel(kind: kind, name: name))
    }

    // MARK: - L'émetteur

    /// Observe les chutes SEULEMENT si l'accord porte sur le texte en vigueur. Appelé à l'ouverture de la session.
    func resumeIfConsented() async {
        guard let settings = try? await service.consentSettings(), settings.isConsented else {
            stopObserving()
            return
        }
        startObserving()
    }

    /// Après l'accord explicite : l'autorisation Santé se demande MAINTENANT, jamais avant. Rend `false` si elle est refusée.
    func enableAfterConsent() async -> Bool {
        guard await source.requestAuthorization() else { return false }
        startObserving()
        return true
    }

    /// Le retrait de l'accord (ou un 403 de la passerelle) : l'observateur et la livraison d'arrière-plan s'arrêtent.
    func stopObserving() {
        source.stop()
        isObserving = false
        ownEpisodeDetectedAt = nil
    }

    private func startObserving() {
        guard let accountId = viewerId(), source.isAvailable else { return }
        source.start(accountId: accountId) { [weak self] samples in
            guard let self else { return false }
            return await self.samplesArrived(samples)
        }
        isObserving = true
    }

    /// Les échantillons neufs que HealthKit vient de rendre. Rend `true` quand l'ancre peut avancer.
    func samplesArrived(_ samples: [Date]) async -> Bool {
        for detectedAt in FallReportPlanner.toReport(samples, lastReported: nil, now: now()) {
            let outcome = await service.report(detectedAt: detectedAt)
            switch FallReportPlanner.next(after: outcome) {
            case .advance:
                noteOwnEpisode(outcome, detectedAt: detectedAt)
            case .retryLater:
                return false
            case .stopObserving:
                stopObserving()
                return false
            }
        }
        return true
    }

    /// Une chute rangée ou dédupliquée ouvre (ou garde) l'épisode que la bannière demande de clore.
    private func noteOwnEpisode(_ outcome: FallReportOutcome, detectedAt: Date) {
        guard outcome == .recorded || outcome == .deduplicated else { return }
        ownEpisodeDetectedAt = max(ownEpisodeDetectedAt ?? detectedAt, detectedAt)
    }

    /// « Je vais bien » : l'épisode se clôt chez mes Sangs, la bannière disparaît.
    @discardableResult
    func answerOk() async -> Bool {
        let cleared = await service.answerOk()
        ownEpisodeDetectedAt = nil
        return cleared
    }

    // MARK: - Le compte

    /// Le compte change. La déconnexion et le passage à un AUTRE compte oublient l'état des autres et coupent
    /// l'observateur ; le premier compte du lancement ne garde le cache que s'il en est le PROPRIÉTAIRE.
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
        stopObserving()
        guard userId != nil else { return }
        lane.submit { [weak self] in await self?.resumeIfConsented() }
    }

    /// Attend que la file ait tout joué — pour qu'un témoin lise un état arrêté.
    func settle() async {
        await lane.barrier()
    }
}

extension FallDetectionCenter {

    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = FallDetectionCenter(
        store: .shared,
        feed: .shared,
        service: FallDetectionService.shared,
        source: HealthKitFallSource(),
        viewerId: { AuthManager.shared.currentUser?.id },
        displayName: { userId in await BatteryCenter.cachedDisplayName(of: userId) },
        connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher()
    )

    private static var accountWatch: AnyCancellable?

    /// Au lancement (y compris un réveil d'arrière-plan par HealthKit) : l'émetteur suit la session, le Sang écoute, et
    /// tout s'oublie au changement de compte.
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

/// Le compte à qui appartient le cache des chutes rangé au repos : un autre compte qui ouvre l'app à froid ne lit
/// jamais les chutes des Sangs du précédent.
protocol FallCacheOwnerStoring: AnyObject {
    var owner: String? { get set }
}

final class UserDefaultsFallCacheOwner: FallCacheOwnerStoring {
    private let key = "me.meeshy.fall.cacheOwner"

    nonisolated deinit {}

    var owner: String? {
        get { UserDefaults.standard.string(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
