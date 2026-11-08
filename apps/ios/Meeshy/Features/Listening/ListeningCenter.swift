import Combine
import Foundation
import MeeshySDK

/// Ce qu'écoute une personne, CHEZ MOI : tel que servi, et jusqu'à quand au plus (horloge de l'appareil).
struct ListeningEntry: Equatable {
    let category: NowPlayingCategory
    let title: String?
    let source: String?
    let updatedAt: Date
    let deadline: Date
}

/// L'ÉCOUTE DE MES PROCHES ET DE MES SANGS SUR iOS (#16755, sous-lot `proche-sang-ecoute@ios` de #13934, iso du web
/// `listening-live.ts`, #16729) — pour toute la durée de l'app.
///
/// - `now-playing:changed` REMPLACE l'état gardé d'une personne, tel que servi : une montée au Sang fait apparaître le
///   titre sans recharger, une baisse le retire (le serveur renvoie l'état tronqué). Un état plus ancien que celui
///   gardé n'écrase rien.
/// - `now-playing:cleared` l'efface (pause, fin, blocage, retrait d'un partage).
/// - Sans nouvel envoi, l'état s'éteint à son échéance, comptée à l'horloge de l'APPAREIL depuis la réception (une
///   horloge décalée ne la prolonge pas), jamais au-delà du TTL du contrat.
/// - À chaque socket accrochée, `GET /relations/now-playing` rattrape : ce qui s'est éteint pendant la coupure
///   disparaît, ce qui est arrivé pendant la demande reste.
/// - Ma propre écoute (un autre de mes appareils) ne s'affiche pas ici.
///
/// Le serveur a déjà jugé (niveau, consentements, blocage) : ce centre ne rejuge rien et n'invente rien.
@MainActor
final class ListeningCenter: ObservableObject {

    @Published private(set) var byUser: [String: ListeningEntry] = [:]

    private let viewerId: () -> String?
    private let snapshot: @Sendable @concurrent () async throws -> [NowPlayingChanged]
    private let now: () -> Date
    private var arrivals = 0
    private var arrivedAt: [String: Int] = [:]
    private var expiry: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        viewerId: @escaping () -> String?,
        snapshot: @escaping @Sendable @concurrent () async throws -> [NowPlayingChanged],
        changedEvents: AnyPublisher<NowPlayingChanged, Never> = NowPlayingEvents.changed,
        clearedEvents: AnyPublisher<NowPlayingCleared, Never> = NowPlayingEvents.cleared,
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
        clearedEvents
            .relay(through: lane) { [weak self] cleared in await self?.clear(cleared.userId) }
            .store(in: &cancellables)
        connected
            .removeDuplicates()
            .filter { $0 }
            .relay(through: lane) { [weak self] _ in await self?.catchUp() }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Recevoir

    func receive(_ changed: NowPlayingChanged) {
        guard changed.userId != viewerId() else { return }
        if let kept = byUser[changed.userId], changed.updatedAt < kept.updatedAt { return }
        arrivals += 1
        arrivedAt[changed.userId] = arrivals
        byUser[changed.userId] = ListeningEntry(
            category: changed.category,
            title: changed.title,
            source: changed.title == nil ? nil : changed.source,
            updatedAt: changed.updatedAt,
            deadline: now().addingTimeInterval(changed.lifetime)
        )
        scheduleExpiry()
    }

    func clear(_ userId: String) {
        arrivedAt.removeValue(forKey: userId)
        guard byUser[userId] != nil else { return }
        byUser.removeValue(forKey: userId)
        scheduleExpiry()
    }

    /// Le repère d'une demande de rattrapage : ce qui arrive APRÈS lui n'est pas effacé par la réponse.
    func mark() -> Int { arrivals }

    /// Le rattrapage : `mark` départage ce qui est arrivé pendant la demande.
    func reconcile(_ items: [NowPlayingChanged], mark: Int) {
        let served = Set(items.map(\.userId))
        byUser.keys
            .filter { !served.contains($0) && (arrivedAt[$0] ?? 0) <= mark }
            .forEach(clear)
        items.forEach(receive)
    }

    /// Ce qui a passé son échéance s'éteint — le minuteur l'appelle, sans événement du serveur.
    func expireDue() {
        let instant = now()
        byUser.filter { $0.value.deadline <= instant }.keys.forEach(clear)
    }

    func catchUp() async {
        let mark = mark()
        guard let items = try? await snapshot() else { return }
        reconcile(items, mark: mark)
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
