import XCTest

/// Garde de source : `Sources/MeeshyUI/` ne doit plus mesurer une taille de
/// LAYOUT contre `UIScreen.main.bounds`, l'écran physique déprécié depuis
/// iOS 16 — sous iPad Split View, Slide Over ou Stage Manager, l'app ne
/// possède qu'une fraction de cet écran, donc un ratio pris contre l'écran
/// est un ratio d'espace que l'app n'a pas. Ni parcourir `connectedScenes` à
/// la main hors de `WindowMetrics` — un `Set` non ordonné dont `.first` peut
/// rendre une scène en arrière-plan.
///
/// Miroir SDK-local de la convergence app-side déjà faite dans
/// `WindowMetricsSSOTTests`/`BubbleWindowMetricsTests` (`apps/ios/`) — le SDK
/// ne peut pas dépendre de `DeviceLayout` (target app), donc `WindowMetrics`
/// (`Sources/MeeshyUI/Utilities/WindowMetrics.swift`) réimplémente le même
/// algorithme plutôt que de l'importer.
///
/// Deux sites restent délibérément sur l'écran physique :
/// - `WindowMetrics.swift` — son propre dernier recours quand aucune scène
///   au premier plan n'existe (miroir du dernier recours de `DeviceLayout`) ;
/// - `CachedAsyncImage.swift` (`max(width, height) * scale`) — calcule un
///   budget de DÉCODAGE, le nombre de pixels max qu'une image pourrait
///   jamais avoir besoin de couvrir, pas une contrainte de layout ;
///   sur-décoder est invisible, sous-décoder ne l'est pas, et la fenêtre peut
///   grandir jusqu'à l'écran (Stage Manager) après le choix de la
///   résolution. Même raisonnement que les deux exceptions symétriques côté
///   app (`BubbleStandardLayout.swift`, `ConversationMediaGalleryView.swift`).
final class WindowMetricsSourceGuardTests: XCTestCase {

    // MARK: - Test réel (fichiers du repo)

    /// Assertion en ÉGALITÉ, pas en inclusion : une inclusion resterait verte
    /// si une nouvelle mesure écran-dérivée apparaissait ailleurs, ce qui est
    /// précisément ce que cette garde existe pour attraper.
    func test_meeshyUI_confinesDisplayBoundsToTheDeliberateDecodeBudgetSite() throws {
        let deliberate: Set<String> = [
            "WindowMetrics.swift",     // the last resort when no scene exists
            "CachedAsyncImage.swift",  // decode target: widest the image may need
        ]

        let found = try Self.allMeeshyUISources()
            .filter { $0.code.contains("UIScreen.main.bounds") }
            .map { ($0.path as NSString).lastPathComponent }

        XCTAssertEqual(
            Set(found), deliberate,
            "Nouvelle mesure écran-dérivée (ou exception délibérée retirée sans mise à jour de " +
            "cette garde). Le layout doit lire WindowMetrics.windowSize ; seul un budget de " +
            "décodage d'image peut encore lire l'écran physique."
        )
    }

    /// Même principe que la garde `UIScreen.main.bounds` ci-dessus, pour l'autre
    /// défaut que `WindowMetrics` résout : un hand-rolled walk de
    /// `connectedScenes` (`.compactMap { $0 as? UIWindowScene }.first`) choisit
    /// une scène arbitraire dans un `Set` non ordonné — potentiellement une
    /// scène en arrière-plan sous multi-fenêtre. `StoryComposerView+Canvas.swift`
    /// (`safeAreaBottomInset`), `MeeshyImageEditorView.swift` et
    /// `MeeshyVideoEditorView.swift` (`deviceSafeAreaInsets`) portaient ce
    /// défaut avant leur convergence vers `WindowMetrics.safeAreaInsets`.
    func test_meeshyUI_confinesConnectedScenesWalksToWindowMetrics() throws {
        let found = try Self.allMeeshyUISources()
            .filter { $0.code.contains("connectedScenes") }
            .map { ($0.path as NSString).lastPathComponent }

        XCTAssertEqual(
            Set(found), ["WindowMetrics.swift"],
            "Nouveau parcours manuel de connectedScenes hors WindowMetrics — connectedScenes est " +
            "un Set non ordonné, .first n'est pas la scène au premier plan. Utiliser " +
            "WindowMetrics.windowSize / .safeAreaInsets."
        )
    }

    // MARK: - Méta-tests de la garde elle-même

    /// Contrôle positif : sans ce test, une garde cassée (mauvais chemin,
    /// détection trop étroite) resterait verte pour toujours et ne
    /// protégerait rien.
    func test_guardDetectsTheBannedPattern() {
        let sample = "var maxHeight: CGFloat { UIScreen.main.bounds.height * 0.65 }"
        XCTAssertTrue(sample.contains("UIScreen.main.bounds"))
    }

    /// Contrôle négatif : la forme corrigée (`WindowMetrics.windowSize`) ne
    /// doit jamais déclencher l'alerte, y compris quand `UIScreen.main.bounds`
    /// n'apparaît qu'en commentaire (documentant par exemple pourquoi on ne
    /// l'utilise plus).
    func test_guardAcceptsWindowMetricsAndIgnoresComments() {
        let sample = """
        // migré depuis UIScreen.main.bounds le 2026-08-12
        var maxHeight: CGFloat { WindowMetrics.windowSize.height * 0.65 }
        """
        let stripped = ComposerSourceGuard.stripComments(sample)
        XCTAssertFalse(stripped.contains("UIScreen.main.bounds"))
    }

    /// `WindowMetrics` doit résoudre la scène par `activationState`, jamais
    /// par position dans le `Set` non ordonné `connectedScenes` — c'est
    /// exactement le défaut que `composerScreenHeight` avait avant cette
    /// convergence (`.first` sur `compactMap`).
    func test_windowMetrics_resolvesTheSceneByActivationState() throws {
        let code = ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Utilities/WindowMetrics.swift"),
                encoding: .utf8
            )
        )

        XCTAssertTrue(
            code.contains("windowScene.activationState == .foregroundActive"),
            "La scène doit être choisie par activationState, jamais par position dans un Set non ordonné."
        )
        XCTAssertTrue(
            code.contains("static var windowSize: CGSize"),
            "windowSize doit rester le point d'entrée public unique de ce type."
        )
        XCTAssertTrue(
            code.contains("static var safeAreaInsets: UIEdgeInsets"),
            "safeAreaInsets doit rester le point d'entrée public unique de ce type."
        )
    }

    // MARK: - Helpers

    private static func allMeeshyUISources() throws -> [(path: String, code: String)] {
        let root = ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        var out: [(path: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let raw = try String(contentsOf: url, encoding: .utf8)
            out.append((relative, ComposerSourceGuard.stripComments(raw)))
        }
        return out.sorted { $0.path < $1.path }
    }
}
