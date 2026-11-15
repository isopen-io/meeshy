import Foundation

// MARK: - Un rendu à la fois, le dernier demandé gagne (#9873)

/// **La boucle de rendu d'un curseur : hors du fil principal, sans délai, sans
/// file d'attente.**
///
/// Un curseur émet plus vite que Core Image ne cuit. Rendre sur le MainActor
/// figeait le geste ; attendre un délai fixe (90 ms dans l'éditeur) retirait
/// tout retour pendant le glissé ; lancer un rendu par cran empilait des
/// rendus périmés sur le GPU. Cette boucle n'en garde qu'UN en vol : les
/// demandes arrivées pendant ce rendu se replient sur la DERNIÈRE, rendue dès
/// que le GPU se libère. Chaque rendu terminé est livré, dans l'ordre, sur le
/// MainActor — le glissé montre donc le look le plus récent disponible, image
/// après image, et le dernier cran est toujours celui qui reste.
///
/// Brique à paramètres opaques : la boucle ne sait ni ce qu'elle rend ni où
/// le résultat se pose.
@MainActor
public final class LatestWinsRenderLoop<Request: Sendable, Output: Sendable> {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let priority: TaskPriority
    private let render: @Sendable (Request) -> Output
    private let deliver: @MainActor (Request, Output) -> Void
    private var pending: Request?
    private var draining = false

    public init(priority: TaskPriority = .userInitiated,
                render: @escaping @Sendable (Request) -> Output,
                deliver: @escaping @MainActor (Request, Output) -> Void) {
        self.priority = priority
        self.render = render
        self.deliver = deliver
    }

    /// `true` tant qu'un rendu est en vol ou qu'une demande l'attend.
    public var isBusy: Bool { draining }

    /// Demande le rendu de `request`. Rendue tout de suite si la boucle est
    /// libre ; sinon elle REMPLACE la demande en attente.
    public func submit(_ request: Request) {
        pending = request
        guard !draining else { return }
        draining = true
        Task { await drain() }
    }

    /// Oublie la demande en attente — le rendu en vol, lui, sera livré.
    public func discardPending() {
        pending = nil
    }

    private func drain() async {
        while let next = pending {
            pending = nil
            let render = self.render
            let output = await Task.detached(priority: priority) { render(next) }.value
            deliver(next, output)
        }
        draining = false
    }
}
