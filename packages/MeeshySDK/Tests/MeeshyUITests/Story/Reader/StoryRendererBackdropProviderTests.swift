import XCTest
import CoreMedia
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// Covers the `backdropProvider` hook on `StoryRenderer.render`.
///
/// The provider is invoked once per glass-style text layer so the caller
/// (live composer or AVFoundation compositor) can supply a Metal texture
/// snapshot of the canvas region beneath. For texts with `.none` / `.solid`
/// the provider must NOT be invoked.
@MainActor
final class StoryRendererBackdropProviderTests: XCTestCase {

    func test_render_doesNotCallProvider_whenNoGlassText() {
        let textObj = StoryTextObject(id: "t1", text: "Hello",
                                      backgroundStyle: .solid(hex: "FFFFFF"))
        let effects = StoryEffects(textObjects: [textObj])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        var providerCallCount = 0
        _ = StoryRenderer.render(slide: slide,
                                 into: geom,
                                 at: .zero,
                                 mode: .play,
                                 backdropProvider: { _ in
                                     providerCallCount += 1
                                     return nil
                                 })
        XCTAssertEqual(providerCallCount, 0,
                       "Backdrop provider must not be invoked for non-glass texts")
    }

    func test_render_callsProvider_oncePerGlassText() {
        let glassA = StoryTextObject(id: "ga", text: "A",
                                     backgroundStyle: .glass(radius: 24))
        let glassB = StoryTextObject(id: "gb", text: "B",
                                     backgroundStyle: .glass(radius: 32))
        let solid = StoryTextObject(id: "s1", text: "S",
                                    backgroundStyle: .solid(hex: "FF0000"))
        let effects = StoryEffects(textObjects: [glassA, glassB, solid])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        var receivedFrames: [CGRect] = []
        _ = StoryRenderer.render(slide: slide,
                                 into: geom,
                                 at: .zero,
                                 mode: .play,
                                 backdropProvider: { frame in
                                     receivedFrames.append(frame)
                                     return nil
                                 })
        XCTAssertEqual(receivedFrames.count, 2,
                       "Backdrop provider must be invoked exactly once per glass text")
    }

    func test_render_nilProvider_doesNotCrash_onGlassText() {
        let glass = StoryTextObject(id: "g1", text: "Hi",
                                    backgroundStyle: .glass(radius: 24))
        let effects = StoryEffects(textObjects: [glass])
        let slide = StorySlide(id: "s", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

        let layer = StoryRenderer.render(slide: slide,
                                         into: geom,
                                         at: .zero,
                                         mode: .play,
                                         backdropProvider: nil)
        XCTAssertNotNil(layer.findFirst(named: "g1"))
    }

    func test_render_providerReceivesFrame_inRenderSpace() {
        // Item centered at (0.5, 0.5) in normalized canvas should produce
        // a layer frame whose midpoint matches the render-space center.
        let glass = StoryTextObject(id: "g1", text: "X",
                                    x: 0.5, y: 0.5,
                                    backgroundStyle: .glass(radius: 24))
        let effects = StoryEffects(textObjects: [glass])
        let slide = StorySlide(id: "s", effects: effects)
        let renderSize = CGSize(width: 1080, height: 1920)
        let geom = CanvasGeometry(renderSize: renderSize)

        var capturedFrame: CGRect = .zero
        _ = StoryRenderer.render(slide: slide,
                                 into: geom,
                                 at: .zero,
                                 mode: .play,
                                 backdropProvider: { frame in
                                     capturedFrame = frame
                                     return nil
                                 })
        let mid = CGPoint(x: capturedFrame.midX, y: capturedFrame.midY)
        XCTAssertEqual(mid.x, renderSize.width * 0.5, accuracy: 1.0,
                       "Captured frame midX must align with render-space center")
        XCTAssertEqual(mid.y, renderSize.height * 0.5, accuracy: 1.0,
                       "Captured frame midY must align with render-space center")
    }
}
