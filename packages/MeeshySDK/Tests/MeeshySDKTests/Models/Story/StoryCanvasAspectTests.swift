import Testing
import Foundation
@testable import MeeshySDK

/// « L'import de l'image de fond impose le cadre et forme du Canvas » : une image
/// de fond paysage bascule le canvas en 16:9 horizontal, sinon il reste vertical
/// 9:16 par défaut. `StoryCanvasAspect` encode cette décision pure, et
/// `StoryEffects.canvasAspectRatio` la persiste (défaut portrait sur tout l'existant).
struct StoryCanvasAspectTests {

    // MARK: - Décision depuis les dimensions de l'image de fond

    @Test func from_landscapeImage_isLandscape() {
        #expect(StoryCanvasAspect.from(width: 1920, height: 1080) == .landscape)
        #expect(StoryCanvasAspect.from(width: 4000, height: 3000) == .landscape) // 4:3 paysage
    }

    @Test func from_portraitImage_isPortrait() {
        #expect(StoryCanvasAspect.from(width: 1080, height: 1920) == .portrait)
        #expect(StoryCanvasAspect.from(width: 3000, height: 4000) == .portrait)
    }

    @Test func from_squareOrInvalid_isPortraitByDefault() {
        #expect(StoryCanvasAspect.from(width: 1000, height: 1000) == .portrait)
        #expect(StoryCanvasAspect.from(width: 0, height: 0) == .portrait)
        #expect(StoryCanvasAspect.from(width: -1, height: 10) == .portrait)
    }

    // MARK: - Reconstruction depuis un ratio persisté

    @Test func from_ratio_nilIsPortrait() {
        #expect(StoryCanvasAspect.from(ratio: nil) == .portrait)
    }

    @Test func from_ratio_greaterThanOneIsLandscape() {
        #expect(StoryCanvasAspect.from(ratio: 16.0 / 9.0) == .landscape)
        #expect(StoryCanvasAspect.from(ratio: 9.0 / 16.0) == .portrait)
        #expect(StoryCanvasAspect.from(ratio: 1.0) == .portrait) // carré → vertical
    }

    // MARK: - Valeurs de ratio

    @Test func ratioValues() {
        #expect(abs(StoryCanvasAspect.portrait.ratio - 9.0 / 16.0) < 0.0001)
        #expect(abs(StoryCanvasAspect.landscape.ratio - 16.0 / 9.0) < 0.0001)
    }

    // MARK: - StoryEffects.canvasAspect

    @Test func effects_defaultCanvasAspect_isPortrait() {
        let effects = StoryEffects()
        #expect(effects.canvasAspectRatio == nil)
        #expect(effects.canvasAspect == .portrait)
    }

    @Test func effects_landscapeRatio_resolvesLandscape() {
        var effects = StoryEffects()
        effects.canvasAspectRatio = 16.0 / 9.0
        #expect(effects.canvasAspect == .landscape)
    }
}
