import Foundation

/// Une rafale de demandes ⇒ UNE exécution, au prochain tour de boucle
/// principale (#9089). La première demande programme ce tour sur-le-champ :
/// rien n'attend plus qu'un saut vers la file principale, celui que
/// `.receive(on: DispatchQueue.main)` coûtait déjà à chaque demande.
@MainActor
final class MainTurnCoalescer {
    nonisolated deinit {}

    private let schedule: (@escaping @MainActor () -> Void) -> Void
    private let action: @MainActor () -> Void
    private var isScheduled = false

    init(
        schedule: @escaping (@escaping @MainActor () -> Void) -> Void = { work in DispatchQueue.main.async { work() } },
        action: @escaping @MainActor () -> Void
    ) {
        self.schedule = schedule
        self.action = action
    }

    func request() {
        guard !isScheduled else { return }
        isScheduled = true
        schedule { [weak self] in
            guard let self else { return }
            self.isScheduled = false
            self.action()
        }
    }
}
