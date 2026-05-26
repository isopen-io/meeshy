// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI

@MainActor
final class StoryBackgroundLayerVideoTests: XCTestCase {
    func test_configure_video_attachesAVPlayerLayer() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4")
        guard let url = testURL else {
            throw XCTSkip("test-1s.mp4 fixture not bundled — add later")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let avLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        XCTAssertNotNil(avLayer)
        XCTAssertEqual(avLayer?.player?.isMuted, true)
    }

    func test_handleAppLifecycle_pausesAndResumes() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4")
        guard let url = testURL else {
            throw XCTSkip("test-1s.mp4 fixture not bundled — add later")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        layer.handleAppLifecycle(active: false)
        // Player rate should be 0 after deactivation
        let avLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        XCTAssertEqual(avLayer?.player?.rate, 0)
    }

    func test_resolveVideoGravity_landscapeVideo_returnsResizeAspect() {
        let canvas = CGSize(width: 1080, height: 1920)
        let landscape = CGSize(width: 1920, height: 1080)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: nil)
        XCTAssertEqual(gravity, .resizeAspect)
    }

    func test_resolveVideoGravity_portraitVideo_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let portrait = CGSize(width: 1080, height: 1920)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: portrait, canvasSize: canvas, override: nil)
        XCTAssertEqual(gravity, .resizeAspectFill)
    }

    func test_resolveVideoGravity_overrideFit_returnsResizeAspect() {
        let canvas = CGSize(width: 1080, height: 1920)
        let portrait = CGSize(width: 1080, height: 1920)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: portrait, canvasSize: canvas, override: "fit")
        XCTAssertEqual(gravity, .resizeAspect)
    }

    func test_resolveVideoGravity_overrideFill_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let landscape = CGSize(width: 1920, height: 1080)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: "fill")
        XCTAssertEqual(gravity, .resizeAspectFill)
    }
}
