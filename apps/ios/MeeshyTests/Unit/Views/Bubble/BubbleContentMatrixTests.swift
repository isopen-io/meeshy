import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleContentMatrixTests: XCTestCase {

    func test_simpleText_hasOnlyTextAndMeta() {
        let msg = makeMessage(content: "Salut")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertNotNil(content.text)
        XCTAssertNil(content.reply)
        XCTAssertEqual(content.attachments, .none)
        XCTAssertNil(content.ephemeral)
        XCTAssertNil(content.editedAt)
        XCTAssertTrue(content.reactions.isEmpty)
        XCTAssertNotNil(content.meta)
    }

    func test_emojiOnly_isFlagged() {
        let msg = makeMessage(content: "🔥🔥🔥")
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertTrue(content.isEmojiOnly)
    }

    func test_messageWithImages_hasVisualGrid() {
        let img1 = makeAttachment(type: .image)
        let img2 = makeAttachment(type: .image)
        let msg = makeMessage(content: "", attachments: [img1, img2])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        guard case .visualGrid(let items) = content.attachments else {
            return XCTFail("expected visualGrid, got \(content.attachments)")
        }
        XCTAssertEqual(items.count, 2)
    }

    func test_audioMessage_routesToAudioCase() {
        let audio = makeAttachment(type: .audio)
        let msg = makeMessage(content: "", attachments: [audio])
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        guard case .audio = content.attachments else {
            return XCTFail("expected audio")
        }
    }

    func test_deletedMessage_routesToDeletedKind() {
        let msg = makeMessage(content: "ignored", deletedAt: Date())
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertEqual(content.kind, .deleted)
    }

    func test_burnedViewOnce_routesToBurnedKind() {
        let msg = makeMessage(content: "secret", isViewOnce: true, viewOnceCount: 1)
        let content = BubbleContent(message: msg, translations: [], preferredTranslation: nil)

        XCTAssertEqual(content.kind, .burned)
    }

    // Helpers — STUB ONLY for Task 1. The real implementations land in Task 2 along
    // with the BubbleContentBuilder. For Task 1, write helpers that compile (build
    // a minimal Message + Attachment) so the test file builds. The tests
    // themselves WILL FAIL at runtime in Task 1 — that's expected. They become
    // green in Task 2 when the BubbleContent(message:...) initializer ships.
    private func makeMessage(
        id: String = "m1",
        content: String,
        attachments: [MeeshyMessageAttachment] = [],
        deletedAt: Date? = nil,
        isViewOnce: Bool = false,
        viewOnceCount: Int = 0
    ) -> MeeshyMessage {
        // Construct a minimal MeeshyMessage — fields chosen to compile against the
        // current MeeshySDK definition. If a required field is missing or
        // signatures changed, look at packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift
        // and adapt.
        fatalError("implement in Task 2 — Task 1 only needs the file to compile")
    }

    private func makeAttachment(type: MeeshyMessageAttachment.AttachmentType) -> MeeshyMessageAttachment {
        fatalError("implement in Task 2")
    }
}
