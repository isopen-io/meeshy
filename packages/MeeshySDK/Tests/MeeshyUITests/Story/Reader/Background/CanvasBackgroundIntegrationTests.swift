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

    private func findBackgroundLayer(in root: CALayer) -> StoryBackgroundLayer? {
        if let bg = root as? StoryBackgroundLayer { return bg }
        for sub in (root.sublayers ?? []) {
            if let found = findBackgroundLayer(in: sub) { return found }
        }
        return nil
    }
}
