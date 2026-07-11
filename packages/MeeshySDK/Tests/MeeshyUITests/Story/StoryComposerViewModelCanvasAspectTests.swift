import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// « L'import du fond de la story impose le cadre et forme du Canvas » — un fond
/// paysage bascule le canvas en 16:9. Historiquement limité aux images
/// (`bg.kind == .image`) ; un fond VIDÉO paysage restait ignoré et le canvas
/// gardait son 9:16 par défaut, laissant la vidéo mal centrée/intégrée dans un
/// cadre portrait — rapporté par l'utilisateur (capture, 2026-07-11) « il faut
/// absolument bien résoudre le sujet des fond/background VIDEO et IMAGE en
/// landscape pour bien centrer et intégrer entièrement ».
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

    func test_landscapeImageBackground_resolvesLandscapeRatio() {
        let effects = makeBackground(kind: .image, aspectRatio: 16.0 / 9.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), StoryCanvasAspect.landscape.ratio)
    }

    func test_landscapeVideoBackground_resolvesLandscapeRatio() {
        let effects = makeBackground(kind: .video, aspectRatio: 16.0 / 9.0)
        XCTAssertEqual(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects), StoryCanvasAspect.landscape.ratio)
    }

    func test_portraitVideoBackground_staysNil() {
        let effects = makeBackground(kind: .video, aspectRatio: 9.0 / 16.0)
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects))
    }

    func test_portraitImageBackground_staysNil() {
        let effects = makeBackground(kind: .image, aspectRatio: 9.0 / 16.0)
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects))
    }

    func test_noBackgroundMedia_staysNil() {
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: StoryEffects()))
    }
}
