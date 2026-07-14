import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Directive user 2026-07-14 : « les contours du canvas doivent être visibles
/// lorsque le contenu d'arrière-plan n'occupe pas tout le canvas ». On matérialise
/// le bord du canvas dès qu'aucun média de fond ne le REMPLIT (aspectFill) —
/// c'est-à-dire : pas de fond visuel, ou fond en mode « fit » (letterbox).
@MainActor
final class StoryComposerViewModelCanvasOutlineTests: XCTestCase {

    private func background(fitMode: String?) -> StoryEffects {
        let media = StoryMediaObject(
            id: "bg-1", postMediaId: "pm-1", kind: .image,
            aspectRatio: 1, isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        if let fitMode {
            effects.backgroundTransform = StoryBackgroundTransform(videoFitMode: fitMode)
        }
        return effects
    }

    func test_noBackgroundMedia_doesNotFillCanvas() {
        XCTAssertFalse(StoryComposerViewModel.backgroundFillsCanvas(for: StoryEffects()),
                       "Sans fond visuel, le canvas n'est pas rempli → contours visibles")
    }

    func test_fillMode_fillsCanvas() {
        XCTAssertTrue(StoryComposerViewModel.backgroundFillsCanvas(for: background(fitMode: nil)),
                      "Mode auto (nil = aspectFill) remplit le canvas → pas de contours")
        XCTAssertTrue(StoryComposerViewModel.backgroundFillsCanvas(for: background(fitMode: "fill")))
    }

    func test_fitMode_doesNotFillCanvas() {
        XCTAssertFalse(StoryComposerViewModel.backgroundFillsCanvas(for: background(fitMode: "fit")),
                       "Mode « fit » (letterbox) laisse des bandes → contours visibles")
    }

    func test_foregroundMediaOnly_doesNotFillCanvas() {
        let fg = StoryMediaObject(id: "fg", postMediaId: "pm", kind: .image,
                                  aspectRatio: 1, isBackground: false)
        var effects = StoryEffects()
        effects.mediaObjects = [fg]
        XCTAssertFalse(StoryComposerViewModel.backgroundFillsCanvas(for: effects),
                       "Un média foreground ne remplit pas le fond du canvas")
    }
}
