// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/CanvasBackgroundIntegrationTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasBackgroundIntegrationTests: XCTestCase {
    func test_canvas_inPlayMode_showsSolidColorBackgroundFromEffects() {
        // StoryEffects.background holds the hex color string
        var effects = StoryEffects()
        effects.background = "#FF0000"  // red hex
        let slide = StorySlide(id: "s", effects: effects)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()

        let bgLayer = findBackgroundLayer(in: view.layer)
        XCTAssertNotNil(bgLayer)
        XCTAssertEqual(bgLayer?.backgroundColor, UIColor.red.cgColor)
    }

    func test_configure_videoSameURLTwice_doesNotReattachPlayerLayer() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        guard let url = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4") else {
            throw XCTSkip("test-1s.mp4 fixture not bundled")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let firstAVLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        let firstPlayer = firstAVLayer?.player

        // Same URL, same transform, same geometry — must be a no-op
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let secondAVLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        let secondPlayer = secondAVLayer?.player

        XCTAssertTrue(firstAVLayer === secondAVLayer, "AVPlayerLayer must be reused, not reattached")
        XCTAssertTrue(firstPlayer === secondPlayer, "AVPlayer must be reused, not recreated")
    }

    func test_doubleTap_onBg_cyclesVideoFitMode() throws {
        let bgMedia = StoryMediaObject(
            id: "bg-1",
            postMediaId: "bg-1",
            mediaURL: "file:///tmp/test.jpg",
            mediaType: "image",
            aspectRatio: 1.0,
            isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [bgMedia]
        let slide = StorySlide(id: "s1", effects: effects)
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.layoutIfNeeded()

        XCTAssertNil(canvas.slide.effects.backgroundTransform?.videoFitMode)
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fit")
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertEqual(canvas.slide.effects.backgroundTransform?.videoFitMode, "fill")
        canvas.performDoubleTapForTesting(targetId: "bg-1")
        XCTAssertNil(canvas.slide.effects.backgroundTransform?.videoFitMode)
    }

    func test_handlePan_bgDrag_updatesLayerTransformLiveBeforeCommit() throws {
        let bgMedia = StoryMediaObject(
            id: "bg-1",
            postMediaId: "bg-1",
            mediaURL: "file:///tmp/test.jpg",
            mediaType: "image",
            aspectRatio: 1.0,
            isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [bgMedia]
        let slide = StorySlide(id: "s1", effects: effects)
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.layoutIfNeeded()

        let initialTransform = canvas.backgroundLayer.transform
        canvas.simulatePanForTesting(targetId: "bg-1", dxNorm: 0.1, dyNorm: 0)
        let liveTransform = canvas.backgroundLayer.transform

        XCTAssertFalse(CATransform3DEqualToTransform(initialTransform, liveTransform),
                      "backgroundLayer.transform must be updated live during drag")
        XCTAssertNil(canvas.slide.effects.backgroundTransform,
                     "Model must not be committed until gesture .ended")
    }

    private func findBackgroundLayer(in root: CALayer) -> StoryBackgroundLayer? {
        if let bg = root as? StoryBackgroundLayer { return bg }
        for sub in (root.sublayers ?? []) {
            if let found = findBackgroundLayer(in: sub) { return found }
        }
        return nil
    }
}
