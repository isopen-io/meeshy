import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Sonde de coût de l'export — mesure le prix PAR FRAME de chaque étage du
/// pipeline pour pouvoir extrapoler à une story longue sans l'exporter en
/// entier (une story de 4 min = 7200 frames : la mesurer directement coûterait
/// une heure).
///
/// Le pipeline est LINÉAIRE en nombre de frames : les deux étages traitent
/// chaque frame indépendamment. Mesurer 10 s et diviser par 300 frames donne
/// donc un ms/frame directement extrapolable.
///
/// ⚠️ Ne mesurer que simulateur AU CALME : un `xcodebuild` concurrent a déjà
/// fait passer le même bake de 1,9 s à 120 s.
///
/// Désactivée par défaut (préfixe `probe_`, non exécutée par `test_`). Lancer
/// explicitement avec `-only-testing:MeeshyUITests/StoryExportCostProbe`.
@MainActor
final class StoryExportCostProbe: XCTestCase {

    /// Durée sondée. Assez longue pour amortir le coût fixe de session,
    /// assez courte pour tourner en moins d'une minute.
    private static let probeSeconds: Double = 10
    private var frameCount: Double { Self.probeSeconds * StoryExportFrameRate.fps }

    func test_probe_bakeAndBrandingCostPerFrame() async throws {
        // Inerte par défaut : un export réel de 10 s coûte ~2 min et n'a rien à
        // faire dans un run de CI. Lancer explicitement — le préfixe
        // `TEST_RUNNER_` est OBLIGATOIRE : `xcodebuild` ne transmet pas
        // l'environnement du shell au processus de test du simulateur, il ne
        // relaie que les variables ainsi préfixées (même mécanisme que
        // `DEMO_USER`/`DEMO_PASSWORD` dans `meeshy.sh test`).
        //   TEST_RUNNER_MEESHY_EXPORT_PROBE=1 xcodebuild test … \
        //     -only-testing:MeeshyUITests/StoryExportCostProbe
        try XCTSkipUnless(ProcessInfo.processInfo.environment["MEESHY_EXPORT_PROBE"] == "1",
                          "Sonde de coût — activer avec MEESHY_EXPORT_PROBE=1")

        let slide = Self.makeStaticSlide(duration: Self.probeSeconds)
        let bakeURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("probe-bake-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bakeURL) }

        // --- Étage 1 : le bake (compositor custom + rasterisation par frame)
        let bakeStart = CFAbsoluteTimeGetCurrent()
        try await StoryExporter.export(slide, to: bakeURL,
                                       watermark: MeeshyExportWatermark.make(username: "probe"))
        let bake = CFAbsoluteTimeGetCurrent() - bakeStart

        // --- Étage 2 : l'emballage de marque (ré-encodage INTÉGRAL de la story)
        // Identité neuve à chaque run : sinon le clip de fin mémoïsé d'un run
        // précédent fausse la mesure en la rendant gratuite.
        let identity = StoryExportIntroContent(displayName: "Probe \(UUID().uuidString)",
                                               username: "probe",
                                               accentColorHex: "#6366F1")
        let wrapStart = CFAbsoluteTimeGetCurrent()
        let finalURL = try await StoryExportBranding.wrap(storyURL: bakeURL,
                                                         intro: identity,
                                                         outro: identity,
                                                         renderSize: CanvasGeometry.designSize)
        let wrap = CFAbsoluteTimeGetCurrent() - wrapStart
        defer { try? FileManager.default.removeItem(at: finalURL) }

        let frames = frameCount
        let total = bake + wrap
        print("""

        ╭─ SONDE COÛT EXPORT — story \(Self.probeSeconds)s / \(Int(frames)) frames
        │ bake       \(String(format: "%7.2f s", bake))  → \(String(format: "%6.1f ms/frame", bake / frames * 1000))
        │ emballage  \(String(format: "%7.2f s", wrap))  → \(String(format: "%6.1f ms/frame", wrap / frames * 1000))
        │ TOTAL      \(String(format: "%7.2f s", total))  → \(String(format: "%6.1f ms/frame", total / frames * 1000))
        │
        │ Extrapolation story 4 min (7200 frames) :
        │ bake       \(String(format: "%7.1f s", bake / frames * 7200))
        │ emballage  \(String(format: "%7.1f s", wrap / frames * 7200))
        │ TOTAL      \(String(format: "%7.1f s", total / frames * 7200))
        ╰─
        """)

        XCTAssertGreaterThan(bake, 0)
    }

    /// Slide représentative du cas signalé : contenu VISUELLEMENT STATIQUE
    /// (texte + stickers), aucune vidéo — seul l'audio court sous les images.
    /// C'est le cas où re-rasteriser 7200 fois la même image est pur gaspillage.
    private static func makeStaticSlide(duration: Double) -> StorySlide {
        var effects = StoryEffects(background: "1E1B4B")
        effects.slideDuration = Float(duration)
        effects.textObjects = [
            StoryTextObject(id: "t1", text: "Une légende de story", x: 0.5, y: 0.35),
            StoryTextObject(id: "t2", text: "Deuxième ligne", x: 0.5, y: 0.5)
        ]
        effects.stickerObjects = [
            StorySticker(id: "s1", emoji: "🎧", x: 0.3, y: 0.7, scale: 1.4),
            StorySticker(id: "s2", emoji: "✨", x: 0.7, y: 0.7, scale: 1.2)
        ]
        return StorySlide(id: "probe-slide", effects: effects, duration: duration, order: 0)
    }
}
