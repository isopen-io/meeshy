// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/ReaderDissolveLiveFallbackTests.swift
import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// C4 — a `.dissolve` clip transition serialized by the timeline editor must be
/// VISIBLE in live playback. The live reader has no CIDissolve compositor, so it
/// degrades to the crossfade opacity ramp through `ReaderTransitionResolver` —
/// the MP4 export (`VideoCompositor`) keeps the real CIDissolve.
final class ReaderDissolveLiveFallbackTests: XCTestCase {

    private func makeMedia(id: String, start: Double, duration: Double) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm-\(id)",
                         mediaType: "image", placement: "media",
                         aspectRatio: 1.0,
                         startTime: start, duration: duration)
    }

    private func dissolve(from: String, to: String, duration: Float = 1.0) -> StoryClipTransition {
        StoryClipTransition(fromClipId: from, toClipId: to, kind: .dissolve, duration: duration)
    }

    func test_opacity_dissolveOutgoing_midWindow_rampsDownLikeCrossfade() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(
            for: media, transitions: [dissolve(from: "a", to: "b")], currentTime: 4.5)
        XCTAssertEqual(opacity, 0.5, accuracy: 0.001,
                       "Live reader must render dissolve as a degraded crossfade ramp, not ignore it")
    }

    func test_opacity_dissolveIncoming_midWindow_rampsUpLikeCrossfade() {
        let media = makeMedia(id: "b", start: 5, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(
            for: media, transitions: [dissolve(from: "a", to: "b")], currentTime: 5.5)
        XCTAssertEqual(opacity, 0.5, accuracy: 0.001)
    }

    func test_opacity_dissolveOutgoing_beforeWindow_staysOpaque() {
        let media = makeMedia(id: "a", start: 0, duration: 5)
        let opacity = ReaderTransitionResolver.opacity(
            for: media, transitions: [dissolve(from: "a", to: "b")], currentTime: 2.0)
        XCTAssertEqual(opacity, 1.0, accuracy: 0.001)
    }

    @MainActor
    func test_render_playModeDissolve_outgoingClipFadesOut() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            makeMedia(id: "clip-a", start: 0, duration: 4),
            makeMedia(id: "clip-b", start: 4, duration: 4),
        ]
        effects.clipTransitions = [dissolve(from: "clip-a", to: "clip-b")]
        let slide = StorySlide(id: "s-dissolve", effects: effects, duration: 8)
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geom,
                                        at: CMTime(seconds: 3.5, preferredTimescale: 600_000),
                                        mode: .play, languages: [])
        let opacity = root.findFirst(named: "clip-a")?.opacity
        XCTAssertEqual(opacity ?? -1, 0.5, accuracy: 0.01,
                       "The R14 post-pass must dim the outgoing clip of a dissolve during live playback")
    }
}
