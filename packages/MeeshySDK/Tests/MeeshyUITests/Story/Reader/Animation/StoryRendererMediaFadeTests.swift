// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryRendererMediaFadeTests.swift
import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// C1 — the fadeIn/fadeOut envelope serialized by the timeline editor must be
/// honoured for FOREGROUND MEDIA during `.play`, exactly like text and stickers.
/// Media involved in a `clipTransition` already flowed through the R14 post-pass
/// (whose base includes the fade envelope); these tests cover the plain media
/// with a fade envelope and no transition, which rendered at full opacity.
@MainActor
final class StoryRendererMediaFadeTests: XCTestCase {

    private func makeMedia(fadeIn: Double? = nil, fadeOut: Double? = nil) -> StoryMediaObject {
        var media = StoryMediaObject(id: "fg-1", postMediaId: "pm-fg-1",
                                     mediaType: "image", placement: "media",
                                     aspectRatio: 1.0,
                                     startTime: 0, duration: 4)
        media.fadeIn = fadeIn
        media.fadeOut = fadeOut
        return media
    }

    private func makeSlide(media: StoryMediaObject,
                           transitions: [StoryClipTransition]? = nil) -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        effects.clipTransitions = transitions
        return StorySlide(id: "s-fade", effects: effects, duration: 8)
    }

    private func renderedOpacity(slide: StorySlide, at seconds: Double,
                                 clipId: String = "fg-1",
                                 cache: StoryRendererCache? = nil) -> Float? {
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))
        let root = StoryRenderer.render(slide: slide, into: geom,
                                        at: CMTime(seconds: seconds, preferredTimescale: 600_000),
                                        mode: .play, languages: [], cache: cache)
        return root.findFirst(named: clipId)?.opacity
    }

    func test_render_playModeMediaFadeIn_midRamp_appliesHalfOpacity() {
        let slide = makeSlide(media: makeMedia(fadeIn: 1.0))
        let opacity = renderedOpacity(slide: slide, at: 0.5)
        XCTAssertEqual(opacity ?? -1, 0.5, accuracy: 0.01,
                       "A foreground media with fadeIn=1s must ramp its opacity at t=0.5 like text/stickers do")
    }

    func test_render_playModeMediaFadeOut_midRamp_appliesHalfOpacity() {
        let slide = makeSlide(media: makeMedia(fadeOut: 1.0))
        let opacity = renderedOpacity(slide: slide, at: 3.5)
        XCTAssertEqual(opacity ?? -1, 0.5, accuracy: 0.01,
                       "A foreground media with fadeOut=1s must ramp its opacity down near its end")
    }

    func test_render_playModeMediaFade_steadyState_keepsFullOpacity() {
        let slide = makeSlide(media: makeMedia(fadeIn: 1.0, fadeOut: 1.0))
        let opacity = renderedOpacity(slide: slide, at: 2.0)
        XCTAssertEqual(opacity ?? -1, 1.0, accuracy: 0.01)
    }

    func test_render_playModeMediaFade_cachedLayer_opacityProgressesAcrossTicks() {
        // Le layer live est CACHÉ entre les ticks (StoryRendererCache) et la
        // signature n'inclut pas l'enveloppe fade : l'opacité doit donc être
        // reposée en post-passe absolue à chaque tick, comme R14.
        let slide = makeSlide(media: makeMedia(fadeIn: 1.0))
        let cache = StoryRendererCache()

        let early = renderedOpacity(slide: slide, at: 0.25, cache: cache)
        let late = renderedOpacity(slide: slide, at: 0.75, cache: cache)
        let steady = renderedOpacity(slide: slide, at: 2.0, cache: cache)

        XCTAssertEqual(early ?? -1, 0.25, accuracy: 0.01)
        XCTAssertEqual(late ?? -1, 0.75, accuracy: 0.01,
                       "The cached layer must be re-stamped with the current fade opacity each tick")
        XCTAssertEqual(steady ?? -1, 1.0, accuracy: 0.01,
                       "Past the fade window the cached layer must be restored to full opacity")
    }

    func test_render_playModeMediaFadeWithCrossfade_noDoubleDimming() {
        // C1×R14 : pour un média impliqué dans une clipTransition, la
        // post-passe pose base(fade) × facteur(transition) en ABSOLU. La
        // valeur attendue est le produit exact — pas un double-dimming où le
        // fade serait appliqué au build PUIS re-multiplié par la post-passe.
        var mediaA = StoryMediaObject(id: "clip-a", postMediaId: "pm-a",
                                      mediaType: "image", placement: "media",
                                      aspectRatio: 1.0, startTime: 0, duration: 4)
        mediaA.fadeOut = 2.0
        let mediaB = StoryMediaObject(id: "clip-b", postMediaId: "pm-b",
                                      mediaType: "image", placement: "media",
                                      aspectRatio: 1.0, startTime: 4, duration: 4)
        var effects = StoryEffects()
        effects.mediaObjects = [mediaA, mediaB]
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "clip-a", toClipId: "clip-b",
                                kind: .crossfade, duration: 1.0),
        ]
        let slide = StorySlide(id: "s-fade-xfade", effects: effects, duration: 8)

        // t=3.5 : fadeOut(2s) → (4−3.5)/2 = 0.25 ; crossfade sortant [3,4] → 0.5.
        let opacity = renderedOpacity(slide: slide, at: 3.5, clipId: "clip-a")
        XCTAssertEqual(opacity ?? -1, 0.125, accuracy: 0.01,
                       "Fade envelope and crossfade factor must combine multiplicatively, once")
    }
}
