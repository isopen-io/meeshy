import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11287 — la couche de fond ouvre la session de QoE dès qu'elle tient un
/// player ET une story déclarée, dans n'importe quel ordre, et la ferme quand
/// le player la quitte ou que l'app passe en arrière-plan.
@MainActor
final class StoryBackgroundLayerPlaybackQoETests: XCTestCase {

    private let story = SocialTarget(kind: .story, id: "65f0a1b2c3d4e5f6a7b8c9d0")
    private let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

    private func configureVideo(_ layer: StoryBackgroundLayer) {
        let remote = URL(string: "https://media.example.invalid/api/v1/attachments/file/qoe-\(UUID().uuidString).mov")!
        layer.configure(kind: .video(postMediaId: "65f0a1b2c3d4e5f6a7b8c9d1", looping: false, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geometry,
                        resolver: { _ in remote }, imageCache: nil)
    }

    func test_aTargetDeclaredAfterTheAttach_opensTheSession() {
        let layer = StoryBackgroundLayer()
        configureVideo(layer)
        XCTAssertFalse(layer.playbackQoE.isRunning, "sans story déclarée, rien n'est mesuré")
        layer.declarePlaybackQoETarget(story)
        XCTAssertTrue(layer.playbackQoE.isRunning)
    }

    func test_aPlayerAttachedAfterTheDeclaration_opensTheSession() {
        let layer = StoryBackgroundLayer()
        layer.declarePlaybackQoETarget(story)
        XCTAssertFalse(layer.playbackQoE.isRunning)
        configureVideo(layer)
        XCTAssertTrue(layer.playbackQoE.isRunning)
    }

    func test_noTarget_measuresNothing() {
        let layer = StoryBackgroundLayer()
        layer.declarePlaybackQoETarget(nil)
        configureVideo(layer)
        XCTAssertFalse(layer.playbackQoE.isRunning)
    }

    func test_aColourBackground_measuresNothing() {
        let layer = StoryBackgroundLayer()
        layer.declarePlaybackQoETarget(story)
        layer.configure(kind: .solidColor(.red), transform: .identity, geometry: geometry, resolver: nil, imageCache: nil)
        XCTAssertFalse(layer.playbackQoE.isRunning)
    }

    func test_reconfiguringTheBackground_closesTheSession() {
        let layer = StoryBackgroundLayer()
        layer.declarePlaybackQoETarget(story)
        configureVideo(layer)
        layer.configure(kind: .solidColor(.red), transform: .identity, geometry: geometry, resolver: nil, imageCache: nil)
        XCTAssertFalse(layer.playbackQoE.isRunning)
        XCTAssertNil(layer.avPlayer)
    }

    func test_goingToTheBackground_closesTheSession() {
        let layer = StoryBackgroundLayer()
        layer.declarePlaybackQoETarget(story)
        configureVideo(layer)
        layer.handleAppLifecycle(active: false)
        XCTAssertFalse(layer.playbackQoE.isRunning)
    }
}
