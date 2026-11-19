import Foundation
import HealthKit

/// La source des chutes de l'émetteur (#18748) — isolée derrière un protocole pour que le centre se teste sans
/// HealthKit. Elle livre les instants des échantillons NEUFS depuis son ancre ; l'ancre n'avance que si la livraison
/// répond `true` (un rapport hors ligne est relivré au réveil suivant), et elle est rangée PAR COMPTE.
@MainActor
protocol FallSampleSourcing: AnyObject {
    /// HealthKit est-il là (un iPad n'a pas l'app Santé) ?
    var isAvailable: Bool { get }
    /// L'autorisation de lecture de `numberOfTimesFallen`, demandée seulement APRÈS l'accord explicite.
    func requestAuthorization() async -> Bool
    /// L'autorisation a-t-elle déjà été demandée, sans erreur ? Sans rien montrer : `false` quand Santé est absente,
    /// quand la capacité HealthKit manque, ou quand la demande reste à faire sur CET appareil.
    func authorizationReady() async -> Bool
    /// Observe le type, en livraison d'arrière-plan immédiate, pour le compte nommé.
    func start(accountId: String, deliver: @escaping @MainActor ([Date]) async -> Bool)
    /// Coupe l'observateur et la livraison d'arrière-plan.
    func stop()
}

/// La source de production : un `HKObserverQuery` réveille l'app, une `HKAnchoredObjectQuery` rend ce qui est neuf.
/// Rien d'autre que `numberOfTimesFallen` n'est demandé, ni lu.
@MainActor
final class HealthKitFallSource: FallSampleSourcing {

    private let store = HKHealthStore()
    private let anchors: FallAnchorStoring
    private var observer: HKObserverQuery?

    nonisolated deinit {}

    init(anchors: FallAnchorStoring = UserDefaultsFallAnchorStore()) {
        self.anchors = anchors
    }

    private var fallType: HKQuantityType { HKQuantityType(.numberOfTimesFallen) }

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await store.requestAuthorization(toShare: [], read: [fallType])
            return true
        } catch {
            return false
        }
    }

    func authorizationReady() async -> Bool {
        guard isAvailable, let status = try? await store.statusForAuthorizationRequest(toShare: [], read: [fallType]) else {
            return false
        }
        return status == .unnecessary
    }

    func start(accountId: String, deliver: @escaping @MainActor ([Date]) async -> Bool) {
        if let observer { store.stop(observer) }
        guard isAvailable else { return }
        let query = HKObserverQuery(sampleType: fallType, predicate: nil) { [weak self] _, completion, error in
            guard error == nil else { return completion() }
            Task { @MainActor in
                await self?.fetchNew(accountId: accountId, deliver: deliver)
                completion()
            }
        }
        observer = query
        store.execute(query)
        store.enableBackgroundDelivery(for: fallType, frequency: .immediate) { _, _ in }
    }

    func stop() {
        if let observer { store.stop(observer) }
        observer = nil
        store.disableBackgroundDelivery(for: fallType) { _, _ in }
    }

    private func fetchNew(accountId: String, deliver: @escaping @MainActor ([Date]) async -> Bool) async {
        let anchor = anchors.anchor(for: accountId)
        let (dates, next) = await withCheckedContinuation { (continuation: CheckedContinuation<([Date], HKQueryAnchor?), Never>) in
            let query = HKAnchoredObjectQuery(type: fallType, predicate: nil, anchor: anchor, limit: HKObjectQueryNoLimit) { _, samples, _, newAnchor, _ in
                continuation.resume(returning: ((samples ?? []).map(\.startDate), newAnchor))
            }
            store.execute(query)
        }
        guard await deliver(dates), let next else { return }
        anchors.save(next, for: accountId)
    }
}

/// Où l'ancre de la requête HealthKit survit, par compte : un autre compte sur le même iPhone repart de zéro. L'ancre
/// est un curseur opaque de HealthKit — aucun instant de chute n'est rangé par Meeshy.
@MainActor
protocol FallAnchorStoring: AnyObject {
    func anchor(for accountId: String) -> HKQueryAnchor?
    func save(_ anchor: HKQueryAnchor, for accountId: String)
    func forget(accountId: String)
}

@MainActor
final class UserDefaultsFallAnchorStore: FallAnchorStoring {
    private let defaults: UserDefaults

    nonisolated deinit {}

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private func key(_ accountId: String) -> String { "me.meeshy.fall.anchor.\(accountId)" }

    func anchor(for accountId: String) -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: key(accountId)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    func save(_ anchor: HKQueryAnchor, for accountId: String) {
        guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
        defaults.set(data, forKey: key(accountId))
    }

    func forget(accountId: String) {
        defaults.removeObject(forKey: key(accountId))
    }
}
