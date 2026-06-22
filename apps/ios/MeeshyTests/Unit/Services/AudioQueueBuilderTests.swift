import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class AudioQueueBuilderTests: XCTestCase {

    // MARK: - Factories

    private func makeAudioAttachment(
        id: String,
        durationMs: Int = 3000,
        fileUrl: String? = nil
    ) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            messageId: nil,
            fileName: "\(id).m4a",
            originalName: "\(id).m4a",
            mimeType: "audio/mp4",
            fileSize: 1234,
            filePath: "",
            fileUrl: fileUrl ?? "https://cdn.example/\(id).m4a",
            duration: durationMs,
            uploadedBy: "sender"
        )
    }

    private func makeTextAttachment(id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: "\(id).txt",
            originalName: "\(id).txt",
            mimeType: "text/plain",
            fileSize: 12,
            filePath: "",
            fileUrl: "https://cdn.example/\(id).txt",
            uploadedBy: "sender"
        )
    }

    private func makeAudioMessage(
        id: String,
        senderId: String = "alice",
        conversationId: String = "conv1",
        senderName: String = "Alice",
        senderAvatarURL: String? = nil,
        attachments: [MeeshyMessageAttachment],
        createdAt: Date
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            content: "",
            messageType: .audio,
            createdAt: createdAt,
            attachments: attachments,
            senderName: senderName,
            senderAvatarURL: senderAvatarURL
        )
    }

    private func makeTextMessage(
        id: String,
        senderId: String = "alice",
        conversationId: String = "conv1",
        senderName: String = "Alice",
        createdAt: Date
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            content: "hello",
            messageType: .text,
            createdAt: createdAt,
            attachments: [],
            senderName: senderName
        )
    }

    private func date(_ ts: TimeInterval) -> Date {
        Date(timeIntervalSince1970: ts)
    }

    // MARK: - 1. Filter audio only, ignore text messages

    func test_build_filtersAudioOnly_ignoresTextMessages() {
        let audio1 = makeAudioMessage(
            id: "m1",
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1000)
        )
        let text = makeTextMessage(id: "m2", createdAt: date(2000))
        let audio2 = makeAudioMessage(
            id: "m3",
            attachments: [makeAudioAttachment(id: "a2")],
            createdAt: date(3000)
        )

        let queue = AudioQueueBuilder.build(
            from: [audio1, text, audio2],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["a1", "a2"])
    }

    // MARK: - 2. Exclude current user's own audios

    func test_build_excludesCurrentUserSelfAudios() {
        let mine = makeAudioMessage(
            id: "m1",
            senderId: "bob",
            senderName: "Bob",
            attachments: [makeAudioAttachment(id: "mine")],
            createdAt: date(1000)
        )
        let theirs = makeAudioMessage(
            id: "m2",
            senderId: "alice",
            senderName: "Alice",
            attachments: [makeAudioAttachment(id: "hers")],
            createdAt: date(2000)
        )

        let queue = AudioQueueBuilder.build(
            from: [mine, theirs],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["hers"])
    }

    // MARK: - 3. Exclude listened attachments

    func test_build_excludesListenedAttachments() {
        let m1 = makeAudioMessage(
            id: "m1",
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1000)
        )
        let m2 = makeAudioMessage(
            id: "m2",
            attachments: [makeAudioAttachment(id: "a2")],
            createdAt: date(2000)
        )

        let queue = AudioQueueBuilder.build(
            from: [m1, m2],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: ["a1"]
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["a2"])
    }

    // MARK: - 4. Sort chronologically ascending

    func test_build_sortsChronologicallyAscending() {
        let m2 = makeAudioMessage(
            id: "m2",
            attachments: [makeAudioAttachment(id: "a2")],
            createdAt: date(2000)
        )
        let m1 = makeAudioMessage(
            id: "m1",
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1000)
        )

        let queue = AudioQueueBuilder.build(
            from: [m2, m1],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["a1", "a2"])
    }

    // MARK: - 5. Stable tie-breaker by attachmentId when receivedAt is equal

    func test_build_stableTieBreaker_byAttachmentId_whenReceivedAtEqual() {
        let same = date(5000)
        let mB = makeAudioMessage(
            id: "mB",
            attachments: [makeAudioAttachment(id: "aB")],
            createdAt: same
        )
        let mA = makeAudioMessage(
            id: "mA",
            attachments: [makeAudioAttachment(id: "aA")],
            createdAt: same
        )

        let queue = AudioQueueBuilder.build(
            from: [mB, mA],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["aA", "aB"])
    }

    // MARK: - 6. starting-after cursor returns only audios received AFTER

    func test_build_startingAfter_returnsOnlyAudiosReceivedAfter() {
        let m1 = makeAudioMessage(
            id: "m1",
            attachments: [makeAudioAttachment(id: "a1")],
            createdAt: date(1000)
        )
        let m2 = makeAudioMessage(
            id: "m2",
            attachments: [makeAudioAttachment(id: "a2")],
            createdAt: date(2000)
        )
        let m3 = makeAudioMessage(
            id: "m3",
            attachments: [makeAudioAttachment(id: "a3")],
            createdAt: date(3000)
        )

        let queue = AudioQueueBuilder.build(
            from: [m1, m2, m3],
            startingAfterAttachmentId: "a1",
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["a2", "a3"])
    }

    // MARK: - 7. Message with multiple audios → each becomes a QueuedAudio

    func test_build_messageWithMultipleAudios_eachBecomesQueuedAudio() {
        let message = makeAudioMessage(
            id: "m1",
            attachments: [
                makeAudioAttachment(id: "a1"),
                makeAudioAttachment(id: "a2"),
                makeAudioAttachment(id: "a3")
            ],
            createdAt: date(1000)
        )

        let queue = AudioQueueBuilder.build(
            from: [message],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.count, 3)
        XCTAssertEqual(Set(queue.map(\.attachmentId)), ["a1", "a2", "a3"])
    }

    // MARK: - 8. Multiple audios in one message preserve original attachment order

    func test_build_messageWithMultipleAudios_orderedByAttachmentIndex() {
        let message = makeAudioMessage(
            id: "m1",
            attachments: [
                makeAudioAttachment(id: "azz"),
                makeAudioAttachment(id: "abb"),
                makeAudioAttachment(id: "amm")
            ],
            createdAt: date(1000)
        )

        let queue = AudioQueueBuilder.build(
            from: [message],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["azz", "abb", "amm"])
    }

    // MARK: - 8b. Cursor message exemption: self-authored multi-audio tail (BUG F)

    func test_build_selfAuthoredCursorMessage_includesSiblingTail() {
        let mine = makeAudioMessage(
            id: "m1",
            senderId: "bob",
            senderName: "Bob",
            attachments: [
                makeAudioAttachment(id: "a1"),
                makeAudioAttachment(id: "a2"),
                makeAudioAttachment(id: "a3")
            ],
            createdAt: date(1000)
        )

        let queue = AudioQueueBuilder.build(
            from: [mine],
            startingAfterAttachmentId: "a1",
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["a2", "a3"])
    }

    func test_build_selfAuthoredCursorMessage_otherSelfMessagesStillExcluded() {
        let cursorMsg = makeAudioMessage(
            id: "m1",
            senderId: "bob",
            senderName: "Bob",
            attachments: [
                makeAudioAttachment(id: "a1"),
                makeAudioAttachment(id: "a2")
            ],
            createdAt: date(1000)
        )
        let otherSelfMsg = makeAudioMessage(
            id: "m2",
            senderId: "bob",
            senderName: "Bob",
            attachments: [makeAudioAttachment(id: "a3")],
            createdAt: date(2000)
        )

        let queue = AudioQueueBuilder.build(
            from: [cursorMsg, otherSelfMsg],
            startingAfterAttachmentId: "a1",
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertEqual(queue.map(\.attachmentId), ["a2"])
    }

    // MARK: - 9. Empty input → empty output

    func test_build_empty_returnsEmpty() {
        let queue = AudioQueueBuilder.build(
            from: [],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: []
        )

        XCTAssertTrue(queue.isEmpty)
    }

    // MARK: - 10. All listened → empty output

    func test_build_allListened_returnsEmpty() {
        let message = makeAudioMessage(
            id: "m1",
            attachments: [
                makeAudioAttachment(id: "a1"),
                makeAudioAttachment(id: "a2")
            ],
            createdAt: date(1000)
        )

        let queue = AudioQueueBuilder.build(
            from: [message],
            startingAfterAttachmentId: nil,
            currentUserId: "bob",
            listenedAttachmentIds: ["a1", "a2"]
        )

        XCTAssertTrue(queue.isEmpty)
    }
}
