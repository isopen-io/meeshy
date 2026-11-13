import Combine
import Foundation

/// La position qu'une personne me partage, CHEZ MOI : telle que servie, et jusqu'à quand au plus (horloge de l'appareil).
public struct SharedLocationEntry: Equatable, Sendable {
    public let latitude: Double
    public let longitude: Double
    public let precision: SharedLocationPrecision
    public let radiusMeters: Double
    public let updatedAt: Date
    public let deadline: Date
}

/// LES POSITIONS QU'ON ME PARTAGE, SUR iOS (#16983, réception de #14109 ; iso du web `shared-locations-live.ts`, #16984).
///
/// - `location:share-changed` REMPLACE la position gardée d'une personne, telle que servie : une montée de précision
///   la rend plus fine sans recharger, une baisse la rend plus grossière. Une position plus ancienne que celle gardée
///   n'écrase rien.
/// - `location:share-ended` l'efface (arrêt, baisse sous Ami, blocage, retrait).
/// - Sans nouvel envoi, la position s'éteint à son échéance, comptée à l'horloge de l'APPAREIL depuis la réception
///   (une horloge décalée ne la prolonge pas), jamais au-delà des 8 h du contrat.
/// - À chaque socket accrochée, et à chaque emprise que la carte demande, `GET /relations/locations` rattrape : le
///   rattrapage FAIT FOI dans son emprise à l'instant où il est parti — une fin survenue pendant la coupure efface la
///   position au lieu de la laisser jusqu'à son terme ; ce qui est arrivé pendant la demande reste.
/// - Ma propre position (un autre de mes appareils) ne s'affiche pas ici.
///
/// Le serveur a déjà jugé (niveau, consentement, blocage, précision) : ce magasin ne rejuge rien, ne rend rien plus
/// précis que servi, et ne garde rien sur le disque.
@MainActor
public final class SharedLocationsLive: ObservableObject {

    public typealias Snapshot = @Sendable @concurrent (SharedLocationBounds?) async throws -> [SharedLocationChanged]

    @Published public private(set) var byUser: [String: SharedLocationEntry] = [:]

    private let viewerId: () -> String?
    private let snapshot: Snapshot
    private let now: () -> Date
    private var arrivals = 0
    private var arrivedAt: [String: Int] = [:]
    private var expiry: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    public init(
        viewerId: @escaping () -> String?,
        snapshot: @escaping Snapshot,
        changedEvents: AnyPublisher<SharedLocationChanged, Never> = SharedLocationEvents.changed,
        endedEvents: AnyPublisher<SharedLocationEnded, Never> = SharedLocationEvents.ended,
        connected: AnyPublisher<Bool, Never>,
        now: @escaping () -> Date = { Date() }
    ) {
        self.viewerId = viewerId
        self.snapshot = snapshot
        self.now = now
        let lane = OrderedEventLane()
        changedEvents
            .relay(through: lane) { [weak self] changed in await self?.receive(changed) }
            .store(in: &cancellables)
        endedEvents
            .relay(through: lane) { [weak self] ended in await self?.clear(ended.userId) }
            .store(in: &cancellables)
        connected
            .removeDuplicates()
            .filter { $0 }
            .relay(through: lane) { [weak self] _ in await self?.catchUp(within: nil) }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Recevoir

    public func receive(_ changed: SharedLocationChanged) {
        guard changed.userId != viewerId() else { return }
        if let kept = byUser[changed.userId], changed.updatedAt < kept.updatedAt { return }
        let deadline = now().addingTimeInterval(changed.lifetime)
        guard deadline > now() else {
            clear(changed.userId)
            return
        }
        arrivals += 1
        arrivedAt[changed.userId] = arrivals
        byUser[changed.userId] = SharedLocationEntry(
            latitude: changed.latitude,
            longitude: changed.longitude,
            precision: changed.precision,
            radiusMeters: changed.radiusMeters,
            updatedAt: changed.updatedAt,
            deadline: deadline
        )
        scheduleExpiry()
    }

    public func clear(_ userId: String) {
        arrivedAt.removeValue(forKey: userId)
        guard byUser[userId] != nil else { return }
        byUser.removeValue(forKey: userId)
        scheduleExpiry()
    }

    /// Le repère d'une demande de rattrapage : ce qui arrive APRÈS lui n'est pas effacé par la réponse.
    public func mark() -> Int { arrivals }

    /// Le rattrapage fait foi dans son emprise (`nil` = toute la carte) : une position gardée DANS l'emprise que la
    /// réponse ne sert plus s'efface, sauf si elle est arrivée après le départ de la demande. Hors de l'emprise, rien
    /// ne bouge — la réponse ne dit rien de ce qu'elle ne couvrait pas.
    public func reconcile(_ items: [SharedLocationChanged], mark: Int, within bounds: SharedLocationBounds?) {
        let served = Set(items.map(\.userId))
        byUser
            .filter { userId, entry in
                !served.contains(userId)
                    && (arrivedAt[userId] ?? 0) <= mark
                    && (bounds?.contains(latitude: entry.latitude, longitude: entry.longitude) ?? true)
            }
            .keys
            .forEach(clear)
        items.forEach(receive)
    }

    /// Ce qui a passé son échéance s'éteint — le minuteur l'appelle, sans événement du serveur.
    public func expireDue() {
        let instant = now()
        byUser.filter { $0.value.deadline <= instant }.keys.forEach(clear)
    }

    /// Le rattrapage d'une emprise : à la connexion (toute la carte), puis à chaque emprise que la carte montre.
    public func catchUp(within bounds: SharedLocationBounds?) async {
        let mark = mark()
        guard let items = try? await snapshot(bounds) else { return }
        reconcile(items, mark: mark, within: bounds)
    }

    // MARK: - Interne

    private func scheduleExpiry() {
        expiry?.cancel()
        guard let next = byUser.values.map(\.deadline).min() else {
            expiry = nil
            return
        }
        let delay = max(0, next.timeIntervalSince(now()))
        expiry = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            self?.expireDue()
        }
    }
}
