import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class MiniAudioPlayerBarTests: XCTestCase {

    private func makeCoord(isPlaying: Bool = false,
                           activeAttachment: String? = nil)
        -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        if let id = activeAttachment {
            coord.test_setActiveContext(attachmentId: id)
            engine.isPlaying = isPlaying
        }
        return (coord, engine)
    }

    func test_visibility_hiddenWhenActiveContextNil() {
        let (coord, _) = makeCoord()
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertFalse(bar.shouldDisplayForTesting)
    }

    func test_visibility_visibleWhenContextSet() {
        let (coord, _) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertTrue(bar.shouldDisplayForTesting)
    }

    func test_tapPlayPause_invokesCoordinator() async {
        let (coord, engine) = makeCoord(isPlaying: false, activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapPlayPauseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.togglePlayPauseCallCount, 1)
    }

    func test_tapNext_invokesCoordinatorPlayNext() async {
        // Seed via `play()` so the internal queue mirrors the active context.
        // `test_setActiveContext` only fakes the published surface — calling
        // playNext() on an unseeded coordinator would drop the upcoming entry
        // because `advanceQueue` removes the head first.
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let current = QueuedAudio(
            attachmentId: "a1", messageId: "m1", conversationId: "c1",
            fileUrl: "https://cdn/a1.m4a", durationMs: 0, senderName: "A",
            senderAvatarURL: nil, receivedAt: Date()
        )
        let upcoming = QueuedAudio(
            attachmentId: "a2", messageId: "m2", conversationId: "c1",
            fileUrl: "https://cdn/a2.m4a", durationMs: 0, senderName: "B",
            senderAvatarURL: nil, receivedAt: Date()
        )
        coord.play(current: current, tail: [upcoming],
                   conversationName: "Conv", conversationArtworkURL: nil)
        let initialPlayCount = engine.playCallCount

        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapNextForTesting()
        await Task.yield()
        XCTAssertEqual(engine.playCallCount, initialPlayCount + 1)
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a2.m4a")
    }

    func test_tapClose_clearsCoordinatorContext() async {
        let (coord, engine) = makeCoord(activeAttachment: "a1")
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        bar.simulateTapCloseForTesting()
        await Task.yield()
        XCTAssertEqual(engine.stopCallCount, 1)
        XCTAssertNil(coord.activeContext)
    }

    func test_tapBody_invokesRouterWithConversationId() {
        let (coord, _) = makeCoord(activeAttachment: "a1")
        var routedConvId: String?
        let bar = MiniAudioPlayerBar(
            coordinatorForTesting: coord,
            onTapBody: {},
            routerForTesting: { convId in routedConvId = convId }
        )
        bar.simulateTapBodyForTesting()
        XCTAssertNotNil(routedConvId)
    }

    func test_displayedContext_returnsActiveContextOrNil() {
        let (coord, _) = makeCoord()
        let bar = MiniAudioPlayerBar(coordinatorForTesting: coord)
        XCTAssertNil(bar.displayedContextForTesting)

        coord.test_setActiveContext(attachmentId: "a1")
        XCTAssertEqual(bar.displayedContextForTesting?.attachmentId, "a1")
    }
}
