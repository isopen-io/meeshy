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
}
