import Foundation

/// Ce qui doit se défaire SOUS la session qui finit, avant que ses identifiants ne s'effacent (#17143) : retirer du
/// serveur un jeton de push attaché à l'appareil, par exemple — sans quoi le compte suivant hériterait des réveils du
/// précédent. `AuthManager` les attend au début d'une déconnexion, bornés par `timeout` : un réseau lent ne retient
/// jamais la sortie.
@MainActor
public final class SessionEndingHooks {
    public typealias Hook = @MainActor @Sendable () async -> Void

    public static let shared = SessionEndingHooks()

    private let timeout: TimeInterval
    private var hooks: [Hook] = []

    nonisolated deinit {}

    public init(timeout: TimeInterval = 4) {
        self.timeout = timeout
    }

    public func add(_ hook: @escaping Hook) {
        hooks.append(hook)
    }

    /// Les crochets tournent dans l'ordre ; passé `timeout`, ils sont annulés (une requête réseau en vol s'interrompt)
    /// et la déconnexion continue.
    func runAll() async {
        let pending = hooks
        guard !pending.isEmpty else { return }
        let limit = timeout
        let work = Task { @MainActor in
            for hook in pending { await hook() }
        }
        let watchdog = Self.watchdog(cancelling: work, after: limit)
        await work.value
        watchdog.cancel()
    }

    /// Le délai vit HORS de l'acteur principal : la tâche naît d'un contexte non isolé, donc sur l'exécuteur
    /// concurrent, et n'attend jamais que l'acteur principal se libère pour annuler le travail (6 s mesurées en CI
    /// pour 0,05 s quand elle l'attendait). Elle hérite de la priorité de l'appelant, ce qu'une tâche détachée perdrait.
    private nonisolated static func watchdog(cancelling work: Task<Void, Never>, after limit: TimeInterval) -> Task<Void, Never> {
        Task {
            do {
                try await Task.sleep(for: .seconds(limit))
                work.cancel()
            } catch {}
        }
    }
}
