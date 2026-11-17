import Foundation

/// **La file des étapes d'une session E2EE, dont la fermeture passe devant**
/// (IOSX-05, #18948).
///
/// Les étapes (ouverture, réceptions, rattrapages, migrations) s'exécutent
/// dans l'ordre où elles sont demandées : deux tâches libres pouvaient
/// rattraper le nouveau compte avant d'oublier l'ancien (audit #12769). Mais la
/// fermeture, rangée derrière elles, attendait la fin de chacune : un
/// rattrapage qu'une passerelle fautive ne terminait jamais retenait la
/// déconnexion, et la session du compte suivant ne s'ouvrait plus.
/// `closeAhead` annule les étapes en vol (celles qui attendent ne commencent
/// pas), exécute la fermeture aussitôt, et ce qui la suit attend que les
/// étapes annulées aient rendu la main.
@MainActor
final class EndToEndLifecycleQueue {
    nonisolated deinit {}

    /// La dernière étape demandée : ce qu'attend la suivante.
    private(set) var tail: Task<Void, Never>?
    /// Les étapes pas encore terminées, que la fermeture annule.
    private var steps: [UUID: Task<Void, Never>] = [:]

    var unfinishedSteps: Int { steps.count }

    func enqueue(_ step: @escaping @concurrent @Sendable () async -> Void) {
        let previous = tail
        let id = UUID()
        let task = Task { [weak self] in
            await previous?.value
            if !Task.isCancelled { await step() }
            self?.steps[id] = nil
        }
        steps[id] = task
        tail = task
    }

    func closeAhead(_ close: @escaping @concurrent @Sendable () async -> Void) {
        steps.values.forEach { $0.cancel() }
        let previous = tail
        let closing = Task { await close() }
        tail = Task {
            await closing.value
            await previous?.value
        }
    }
}
