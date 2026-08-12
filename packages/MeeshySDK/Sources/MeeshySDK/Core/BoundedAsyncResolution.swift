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
/// Implémenté en `withCheckedContinuation` + boîte de résolution unique
/// plutôt qu'en `withTaskGroup` : un `addTask { @MainActor in await
/// operation() }` capturant une closure `@Sendable` fait buter le vérificateur
/// d'isolation par régions sur une limitation réelle du compilateur
/// (« pattern that the region based isolation checker does not understand
/// how to check », reproductible avec Swift 6.0 / Xcode 26.1). Ce patron
/// évite `withTaskGroup`.
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
        await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
            let box = _RaceBox<T>(continuation)
            Task { @MainActor in
                let value = await operation()
                box.finish(with: value)
            }
            Task { @MainActor in
                try? await Task.sleep(for: timeout)
                box.finish(with: nil)
            }
        }
    }
}

/// Résout une continuation partagée exactement une fois : la première des
/// deux tentatives (opération ou timeout, voir `BoundedAsyncResolution`) à
/// finir gagne, l'autre est ignorée sans crasher (`CheckedContinuation`
/// interdit une double reprise). Les deux `Task` qui appellent `finish(with:)`
/// sont créées depuis le MÊME contexte `@MainActor` et héritent donc du
/// MainActor par défaut (SE-0461) — `didFinish` est donc sérialisé en
/// pratique malgré l'annotation `@unchecked Sendable`, requise pour franchir
/// la frontière non-Sendable du closure de `withCheckedContinuation`.
private final class _RaceBox<T: Sendable>: @unchecked Sendable {
    private let continuation: CheckedContinuation<T?, Never>
    private var didFinish = false

    init(_ continuation: CheckedContinuation<T?, Never>) {
        self.continuation = continuation
    }

    func finish(with value: T?) {
        guard !didFinish else { return }
        didFinish = true
        continuation.resume(returning: value)
    }
}
