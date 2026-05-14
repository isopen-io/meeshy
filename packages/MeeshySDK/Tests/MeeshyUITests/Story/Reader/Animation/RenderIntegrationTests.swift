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
}
