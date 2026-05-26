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
}
