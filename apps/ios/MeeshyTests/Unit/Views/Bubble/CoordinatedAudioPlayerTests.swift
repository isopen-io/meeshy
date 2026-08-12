import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class CoordinatedAudioPlayerTests: XCTestCase {

    private func makeQueued(_ id: String) -> QueuedAudio {
        QueuedAudio(attachmentId: id, messageId: "post-1", conversationId: "post-1",
                    fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                    senderName: "Ashley", senderAvatarURL: nil, receivedAt: Date())
    }

    private func makeSUT(
        attachmentId: String, coordinator: ConversationAudioCoordinator
    ) -> CoordinatedAudioPlayer<EmptyView> {
        CoordinatedAudioPlayer(
            attachmentId: attachmentId,
            nowPlayingName: "Ashley",
            nowPlayingArtworkURL: nil,
            coordinatorForTesting: coordinator,
            makeQueuedAudio: { self.makeQueued(attachmentId) }
        ) { _, _ in EmptyView() }
    }

    func test_inactive_whenCoordinatorPlaysAnotherAttachment() {
        let coordinator = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        coordinator.test_setActiveContext(attachmentId: "other")
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)
        XCTAssertFalse(sut.isActiveForTesting)
    }

    func test_active_whenCoordinatorPlaysThisAttachment() {
        let coordinator = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        coordinator.test_setActiveContext(attachmentId: "mine")
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)
        XCTAssertTrue(sut.isActiveForTesting)
    }

    func test_playRequest_startsSingleItemQueueOnCoordinator() {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)

        sut.requestPlayForTesting()

        XCTAssertEqual(coordinator.queueCount, 1)
        XCTAssertEqual(coordinator.activeContext?.attachmentId, "mine")
        XCTAssertEqual(coordinator.activeContext?.conversationName, "Ashley")
        XCTAssertEqual(engine.lastPlayedUrl, "https://x/mine.m4a")
    }

    // MARK: - Re-render isolation from engine ticks (mirrors AudioBubbleRouterTests)

    /// Mirror of `AudioBubbleRouterTests.test_router_onlyReactsToActiveContextChanges_notEngineTicks`
    /// for the standalone-surface routeur: `isActiveForTesting` reads
    /// `coordinator.activeContext?.attachmentId` directly, so tick-rate
    /// publishers (currentTime/progress/isPlaying) that don't mutate
    /// `activeContext` must never flip the routing decision.
    func test_isActiveForTesting_onlyReactsToActiveContextChanges_notEngineTicks() async {
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        let sut = makeSUT(attachmentId: "mine", coordinator: coordinator)

        XCTAssertFalse(sut.isActiveForTesting)

        // Engine ticks flow through the coordinator's @Published properties
        // via `wireEngineForwarding`, but none of them mutate `activeContext`.
        engine.currentTime = 0.5
        engine.progress = 0.1
        engine.isPlaying = true
        engine.currentTime = 1.0
        engine.progress = 0.2
        await Task.yield()
        XCTAssertFalse(sut.isActiveForTesting,
                       "engine tick must NOT flip the routing decision")

        // Genuine activeContext change — decision flips true.
        coordinator.test_setActiveContext(attachmentId: "mine")
        await Task.yield()
        XCTAssertTrue(sut.isActiveForTesting,
                      "activeContext change MUST flip the routing decision")

        // More ticks while active — still no flip back to false.
        engine.currentTime = 2.0
        engine.progress = 0.4
        await Task.yield()
        XCTAssertTrue(sut.isActiveForTesting,
                      "engine tick while active must NOT flip back to inactive")
    }
}
