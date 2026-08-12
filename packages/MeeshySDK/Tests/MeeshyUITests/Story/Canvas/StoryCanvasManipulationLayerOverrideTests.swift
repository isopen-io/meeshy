import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Directive user 2026-07-14 : la bordure gauche ne parle plus de « Canvas ».
/// Deux chips TAPPABLES « Arrière-plan » / « Premier plan » qui pilotent quelle
/// couche reçoit les gestes. La sélection utilisateur (`override`) prime sur la
/// dérivation automatique tant qu'elle reste valide pour le contenu ; sinon on
/// retombe sur l'auto (rétro-compatible).
@MainActor
final class StoryCanvasManipulationLayerOverrideTests: XCTestCase {

    private func effectsWithBackgroundAndForeground() -> StoryEffects {
        var text = StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.5)
        text.fontSize = 96
        var bg = StoryMediaObject(id: "bg1", postMediaId: "bg1", kind: .image, aspectRatio: 1)
        bg.isBackground = true
        var effects = StoryEffects()
        effects.textObjects = [text]
        effects.mediaObjects = [bg]
        return effects
    }

    private func effectsBackgroundOnly() -> StoryEffects {
        var bg = StoryMediaObject(id: "bg1", postMediaId: "bg1", kind: .image, aspectRatio: 1)
        bg.isBackground = true
        var effects = StoryEffects()
        effects.mediaObjects = [bg]
        return effects
    }

    // MARK: - Résolution pure avec override

    func test_resolveWithoutOverride_matchesAuto() {
        let effects = effectsWithBackgroundAndForeground()
        XCTAssertEqual(
            StoryCanvasUIView.resolveManipulationLayer(for: effects, override: nil),
            StoryCanvasUIView.resolveManipulationLayer(for: effects),
            "Sans override, la résolution doit rester l'auto-dérivation (rétro-compat)"
        )
        XCTAssertEqual(
            StoryCanvasUIView.resolveManipulationLayer(for: effects, override: nil),
            .foreground,
            "Un foreground présent dérive .foreground par défaut"
        )
    }

    func test_backgroundOverride_withBackgroundPresent_forcesBackground() {
        let effects = effectsWithBackgroundAndForeground()
        XCTAssertEqual(
            StoryCanvasUIView.resolveManipulationLayer(for: effects, override: .background),
            .background,
            "Taper « Arrière-plan » force la couche background même quand un foreground existe"
        )
    }

    func test_foregroundOverride_withForegroundPresent_forcesForeground() {
        let effects = effectsWithBackgroundAndForeground()
        XCTAssertEqual(
            StoryCanvasUIView.resolveManipulationLayer(for: effects, override: .foreground),
            .foreground
        )
    }

    func test_backgroundOverride_withoutBackground_fallsBackToAuto() {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t1", text: "hi", x: 0.5, y: 0.5)]
        XCTAssertEqual(
            StoryCanvasUIView.resolveManipulationLayer(for: effects, override: .background),
            .foreground,
            "Override background invalide (aucun fond) → retombe sur l'auto"
        )
    }

    func test_foregroundOverride_withoutForeground_fallsBackToAuto() {
        let effects = effectsBackgroundOnly()
        XCTAssertEqual(
            StoryCanvasUIView.resolveManipulationLayer(for: effects, override: .foreground),
            .background,
            "Override foreground invalide (aucun élément fg) → retombe sur l'auto (.background)"
        )
    }

    // MARK: - setManipulationLayer sur l'instance

    func test_setManipulationLayer_background_persistsAcrossContentResync() {
        var slide = StorySlide(id: "s")
        slide.effects = effectsWithBackgroundAndForeground()
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.rebuildLayers()

        canvas.setManipulationLayer(.background)
        XCTAssertEqual(canvas.currentManipulationLayer, .background)

        // Une re-synchro de contenu (slide.didSet → updateManipulationLayer) ne
        // doit PAS écraser le choix utilisateur tant qu'il reste valide.
        canvas.updateManipulationLayer()
        XCTAssertEqual(canvas.currentManipulationLayer, .background,
                       "La sélection utilisateur persiste tant que le fond existe")
    }

    func test_setManipulationLayer_emitsCallback() {
        var slide = StorySlide(id: "s")
        slide.effects = effectsWithBackgroundAndForeground()
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.rebuildLayers()

        var emitted: [CanvasManipulationLayer] = []
        canvas.onManipulationLayerChanged = { emitted.append($0) }
        canvas.setManipulationLayer(.background)

        XCTAssertEqual(emitted.last, .background,
                       "Le tap sur un chip doit propager la couche au composer (highlight)")
    }
}
