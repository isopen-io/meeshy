import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// « L'import du fond de la story impose le cadre et forme du Canvas » — le
/// canvas suit le RATIO CONTINU du fond (plus de snap binaire 9:16/16:9),
/// clampé à [9/21, 21/9] pour éviter un canvas dégénéré sur un fond au ratio
/// extrême (directive user 2026-07-14).
@MainActor
final class StoryComposerViewModelCanvasAspectTests: XCTestCase {

    private func makeBackground(kind: StoryMediaKind, aspectRatio: Double) -> StoryEffects {
        let media = StoryMediaObject(
            id: "bg-1", postMediaId: "pm-1", kind: kind,
            aspectRatio: aspectRatio, isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        return effects
    }

    func test_landscapeImageBackground_resolvesItsExactRatio() {
        let effects = makeBackground(kind: .image, aspectRatio: 16.0 / 9.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 16.0 / 9.0)
    }

    func test_landscapeVideoBackground_resolvesItsExactRatio() {
        let effects = makeBackground(kind: .video, aspectRatio: 16.0 / 9.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 16.0 / 9.0)
    }

    func test_portraitVideoBackground_resolvesItsExactRatio_noLongerSnapsToNil() {
        let effects = makeBackground(kind: .video, aspectRatio: 9.0 / 16.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 9.0 / 16.0)
    }

    func test_portraitImageBackground_resolvesItsExactRatio_noLongerSnapsToNil() {
        let effects = makeBackground(kind: .image, aspectRatio: 9.0 / 16.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 9.0 / 16.0)
    }

    func test_nearSquareBackground_resolvesItsExactRatio() {
        let effects = makeBackground(kind: .image, aspectRatio: 4.0 / 5.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 4.0 / 5.0)
    }

    func test_noBackgroundMedia_staysNil() {
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: StoryEffects()))
    }

    // MARK: - Clamp [9/21, 21/9] — never a degenerate sliver canvas

    func test_extremePanoramaBackground_clampsToUpperBound() {
        let effects = makeBackground(kind: .image, aspectRatio: 4.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 21.0 / 9.0)
    }

    func test_extremeTallScreenshotBackground_clampsToLowerBound() {
        let effects = makeBackground(kind: .image, aspectRatio: 0.2)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), 9.0 / 21.0)
    }
}
