import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// Verifies the routing decision in `AudioBubbleRouter`: a bubble routes to
/// the shared coordinator engine iff `coordinator.activeContext.attachmentId`
/// matches its own `attachmentId`. The decision is observable via the
/// `isActiveForTesting` accessor so tests don't need to render the view tree.
@MainActor
final class AudioBubbleRouterTests: XCTestCase {

    private func makeRouter(
        attachmentId: String,
        coordinator: ConversationAudioCoordinator
    ) -> AudioBubbleRouter {
        let attachment = MeeshyMessageAttachment(
            id: attachmentId,
            messageId: nil,
            fileName: "\(attachmentId).m4a",
            originalName: "\(attachmentId).m4a",
            mimeType: "audio/mp4",
            fileSize: 1234,
            filePath: "",
            fileUrl: "https://cdn/\(attachmentId).m4a",
            duration: 5_000,
            uploadedBy: "sender"
        )
        return AudioBubbleRouter(
            attachmentId: attachmentId,
            attachment: attachment,
            accentColorHex: "FF6B6B",
            onPlayRequest: {},
            coordinatorForTesting: coordinator
        )
    }

    func test_isActive_falseWhenActiveContextNil() {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let router = makeRouter(attachmentId: "a1", coordinator: coord)
        XCTAssertFalse(router.isActiveForTesting)
    }

    func test_isActive_falseWhenActiveContextDifferent() {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        coord.test_setActiveContext(attachmentId: "a99")
        let router = makeRouter(attachmentId: "a1", coordinator: coord)
        XCTAssertFalse(router.isActiveForTesting)
    }

    func test_isActive_trueWhenActiveContextMatches() {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        coord.test_setActiveContext(attachmentId: "a1")
        let router = makeRouter(attachmentId: "a1", coordinator: coord)
        XCTAssertTrue(router.isActiveForTesting)
    }

    func test_isActive_updatesWhenContextChanges() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let router = makeRouter(attachmentId: "a1", coordinator: coord)
        XCTAssertFalse(router.isActiveForTesting)

        coord.test_setActiveContext(attachmentId: "a1")
        await Task.yield()
        XCTAssertTrue(router.isActiveForTesting)
    }

    // MARK: - Storm #1 — re-render isolation from engine ticks

    /// The router subscribes to a derived publisher built from
    /// `coordinator.$activeContext.map { $0?.attachmentId == self.attachmentId
    /// }.removeDuplicates()`. Tick-rate publishers (currentTime, progress,
    /// isPlaying) MUST NOT flip the derived bool, since they don't change
    /// `activeContext`. This test validates the routing decision is stable
    /// across engine ticks — proxying the perf claim "20Hz ticks no longer
    /// reach the router body".
    func test_router_onlyReactsToActiveContextChanges_notEngineTicks() async {
        let engine = MockAudioPlaybackEngine()
        let coord = ConversationAudioCoordinator(engine: engine)
        let router = makeRouter(attachmentId: "a1", coordinator: coord)

        XCTAssertFalse(router.isActiveForTesting)

        // Simulating engine ticks: currentTime / progress / isPlaying all
        // flow through the coordinator's `@Published` properties via
        // `wireEngineForwarding`, but none of them mutate `activeContext`.
        // The derived bool must stay `false`.
        engine.currentTime = 0.5
        engine.progress = 0.1
        engine.isPlaying = true
        engine.currentTime = 1.0
        engine.progress = 0.2
        engine.currentTime = 1.5
        engine.progress = 0.3
        await Task.yield()
        XCTAssertFalse(router.isActiveForTesting,
                       "engine tick must NOT flip the router's active decision")

        // Genuine activeContext change — derived bool flips true.
        coord.test_setActiveContext(attachmentId: "a1")
        await Task.yield()
        XCTAssertTrue(router.isActiveForTesting,
                      "activeContext change MUST flip the router's active decision")

        // More ticks while active — still no flip back to false.
        engine.currentTime = 2.0
        engine.progress = 0.4
        engine.currentTime = 2.5
        engine.progress = 0.5
        await Task.yield()
        XCTAssertTrue(router.isActiveForTesting,
                      "engine tick while active must NOT flip back to inactive")
    }
}
