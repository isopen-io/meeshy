// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/RenderIntegrationTests.swift
import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class RenderIntegrationTests: XCTestCase {
    func test_render_inPlayMode_appliesKeyframesToTextLayer() {
        // Static position: x=0 (left edge). Keyframes animate x from 0→1 over 1s.
        // At t=0.5, keyframe override = x=0.5 normalized → render x = 540.
        // Without keyframe integration, static x=0 → render x = 0. The assertion
        // at 540 only passes once keyframe overrides are applied in render().
        let kfs = [
            StoryKeyframe(time: 0, x: 0.0, y: 0.5),
            StoryKeyframe(time: 1.0, x: 1.0, y: 0.5),
        ]
        let txt = StoryTextObject(id: "t1", text: "x", x: 0.0, y: 0.5, keyframes: kfs)
        let effects = StoryEffects(textObjects: [txt])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let layer = StoryRenderer.render(slide: slide, into: geom,
                                         at: CMTime(seconds: 0.5, preferredTimescale: 600_000),
                                         mode: .play, languages: [])
        let textLayer = layer.findFirst(named: "t1")
        // At t=0.5 with x: 0→1, normalized x = 0.5 → design x = 540 → render x = 540
        XCTAssertEqual(textLayer?.position.x ?? 0, 540, accuracy: 1.0)
    }

    // MARK: - R14 : crossfade intra-slide (clipTransitions) au playback

    private func makeCrossfadeSlide() -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "clip-a", postMediaId: "pm-a", mediaType: "image",
                             placement: "media", aspectRatio: 1.0, startTime: 0, duration: 4),
            StoryMediaObject(id: "clip-b", postMediaId: "pm-b", mediaType: "image",
                             placement: "media", aspectRatio: 1.0, startTime: 4, duration: 4),
        ]
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "clip-a", toClipId: "clip-b",
                                kind: .crossfade, duration: 1.0),
        ]
        return StorySlide(id: "s-xfade", effects: effects, duration: 8)
    }

    private func renderedOpacity(slide: StorySlide, at seconds: Double,
                                 clipId: String, cache: StoryRendererCache? = nil) -> Float? {
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))
        let root = StoryRenderer.render(slide: slide, into: geom,
                                        at: CMTime(seconds: seconds, preferredTimescale: 600_000),
                                        mode: .play, languages: [], cache: cache)
        return root.findFirst(named: clipId)?.opacity
    }

    func test_render_playMode_crossfade_outgoingClipFadesOut() {
        // Fenêtre sortante de clip-a : [end-d, end] = [3, 4]. À t=3.5 → 0.5.
        let opacity = renderedOpacity(slide: makeCrossfadeSlide(), at: 3.5, clipId: "clip-a")
        XCTAssertEqual(opacity ?? -1, 0.5, accuracy: 0.01,
                       "The outgoing clip must fade out during the crossfade window (published-story parity with the timeline preview)")
    }

    func test_render_playMode_crossfade_incomingClipFadesIn() {
        // Fenêtre entrante de clip-b : [start, start+d] = [4, 5]. À t=4.5 → 0.5.
        let opacity = renderedOpacity(slide: makeCrossfadeSlide(), at: 4.5, clipId: "clip-b")
        XCTAssertEqual(opacity ?? -1, 0.5, accuracy: 0.01,
                       "The incoming clip must fade in during the crossfade window")
    }

    func test_render_playMode_crossfade_cachedLayer_opacityIsAbsoluteAcrossTicks() {
        // Le layer CACHÉ garde l'opacité mutée du tick précédent : la
        // post-passe doit poser une opacité ABSOLUE (base × facteur), jamais
        // multiplier en place, et RE-poser 1.0 une fois la fenêtre finie.
        let slide = makeCrossfadeSlide()
        let cache = StoryRendererCache()

        let atMid = renderedOpacity(slide: slide, at: 3.5, clipId: "clip-a", cache: cache)
        let atLate = renderedOpacity(slide: slide, at: 3.8, clipId: "clip-a", cache: cache)
        let before = renderedOpacity(slide: slide, at: 1.0, clipId: "clip-a", cache: cache)

        XCTAssertEqual(atMid ?? -1, 0.5, accuracy: 0.01)
        XCTAssertEqual(atLate ?? -1, 0.2, accuracy: 0.01,
                       "Progress 0.8 → 0.2 absolute, not 0.5 × 0.2 cumulative")
        XCTAssertEqual(before ?? -1, 1.0, accuracy: 0.01,
                       "Outside the window the involved clip must be restored to its base opacity")
    }
}
