import Foundation

/// Course entre une résolution asynchrone et une borne de temps : la première
/// à finir gagne, l'autre continue en arrière-plan mais son résultat est
/// ignoré.
///
/// Extrait de `StoryPhotoSaveService.resolveIntro` (son usage d'origine, app
/// target) pour que `TimelineExportController` (SDK, Task 9 — revue round 2)
/// applique la MÊME borne à la résolution de l'interlude de marque, au lieu
/// d'attendre sans limite un avatar/fond non caché (`URLSession`, jusqu'à
/// ~60 s de timeout par défaut) — ce qui laisserait sinon la barre de
/// progression figée à 0 % pendant potentiellement une minute au premier
/// export après installation. Passé le délai, l'appelant démarre SANS
/// interlude de marque plutôt que de bloquer : dégradation gracieuse, la
/// résolution d'identité n'est ni supprimée ni contournée, juste bornée dans
/// le temps.
///
/// Implémenté en `withCheckedContinuation` + case de résolution unique plutôt
/// qu'en `withTaskGroup` : un groupe attend TOUS ses enfants, donc après le
/// délai il attendrait encore une opération qui ignore l'annulation — la borne
/// de temps ne tiendrait plus ; et un `addTask { @MainActor in await
/// operation() }` capturant une closure `@Sendable` fait buter le vérificateur
/// d'isolation par régions (« pattern that the region based isolation checker
/// does not understand how to check », Swift 6.0 / Xcode 26.1).
///
/// L'annulation de l'appelant rend `nil` sans attendre le délai.
public enum BoundedAsyncResolution {

    /// Borne partagée par TOUS les chemins d'export de story qui résolvent
    /// l'identité de marque (`StoryPhotoSaveService`,
    /// `StoryExportShareViewModel`, `TimelineExportController`).
    ///
    /// Elle vit ici, à côté de `resolve`, plutôt que dupliquée en littéral
    /// `.seconds(4)` sur chaque appelant : la revue finale a trouvé deux
    /// chemins bornés et un troisième — « Partager » — qui ne l'était pas,
    /// précisément parce que la valeur n'avait pas de domicile commun. Un
    /// quatrième chemin qui l'oublierait se verrait tout de suite.
    ///
    /// 4 s : au-delà, l'avatar/la bannière ne sont manifestement pas en cache
    /// et l'appel réseau peut courir jusqu'au timeout `URLSession` par défaut
    /// (~60 s). Mieux vaut un export sans interlude qu'une barre figée à 0 %
    /// pendant une minute.
    public static let defaultTimeout: Duration = .seconds(4)

    /// Borne de l'extraction d'une frame vidéo destinée à un thumbHash
    /// (`StoryThumbHashEnricher`). Elle vit ICI, à côté de sa sœur, pour la
    /// même raison : une borne de temps sans domicile commun se duplique en
    /// littéral chez chaque appelant puis diverge — le commentaire de
    /// `defaultTimeout` documente l'incident qui a coûté un troisième chemin
    /// non borné.
    ///
    /// 5 s (et non 4) : contrairement à la résolution d'identité de marque, ce
    /// travail court APRÈS le retour au feed — personne n'attend devant un
    /// écran. Le budget peut donc être plus large ; passé ce délai le média
    /// part sans thumbHash (le lecteur affiche le fond au lieu du flou).
    public static let storyThumbHashTimeout: Duration = .seconds(5)

    /// - Parameters:
    ///   - operation: résolution asynchrone à borner. `@MainActor` : les deux
    ///     appelants actuels (`StoryPhotoSaveService.intro`,
    ///     `TimelineExportController.introProvider`) sont des closures
    ///     main-actor-isolées qui capturent potentiellement `self`/`@Published`.
    ///   - timeout: délai maximal avant repli sur `nil`.
    /// - Returns: le résultat de `operation()` s'il arrive avant `timeout`,
    ///   sinon `nil`. `operation` continue de tourner en arrière-plan dans ce
    ///   dernier cas ; son résultat tardif est simplement ignoré.
    @MainActor
    public static func resolve<T: Sendable>(
        _ operation: @escaping @MainActor @Sendable () async -> T?,
        timeout: Duration
    ) async -> T? {
        let slot = BoundedResolutionSlot<T>()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
                slot.install(continuation)
                Task { @MainActor in
                    slot.finish(await operation())
                }
                slot.arm(timer: Task {
                    guard await cancellableSleep(for: timeout) else { return }
                    slot.finish(nil)
                })
                if Task.isCancelled { slot.finish(nil) }
            }
        } onCancel: {
            slot.finish(nil)
        }
    }
}

/// Résout la continuation partagée exactement une fois : la première des
/// tentatives (opération, délai, annulation de l'appelant) gagne, les autres
/// sont ignorées sans crasher (`CheckedContinuation` interdit une double
/// reprise). La continuation est reprise hors verrou.
private final class BoundedResolutionSlot<T: Sendable>: Sendable {
    private struct State {
        var continuation: CheckedContinuation<T?, Never>?
        var timer: Task<Void, Never>?
    }

    private let state = Locked(State())

    func install(_ continuation: CheckedContinuation<T?, Never>) {
        state.mutate { $0.continuation = continuation }
    }

    func arm(timer: Task<Void, Never>) {
        let alreadyFinished = state.mutate { current -> Bool in
            guard current.continuation != nil else { return true }
            current.timer = timer
            return false
        }
        if alreadyFinished { timer.cancel() }
    }

    func finish(_ value: T?) {
        let taken = state.mutate { current -> State in
            let snapshot = current
            current = State()
            return snapshot
        }
        taken.timer?.cancel()
        taken.continuation?.resume(returning: value)
    }
}
