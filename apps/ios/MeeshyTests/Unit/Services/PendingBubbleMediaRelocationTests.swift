import XCTest
import GRDB
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class PendingBubbleMediaRelocationTests: XCTestCase {

    private static let conversationId = "00000000000000000000c151"

    private final class RelocatorSpy: PendingBubbleMediaRelocating {
        private(set) var calls: [(tempId: String, attachmentIds: [String], storedPaths: [String])] = []

        func relocate(tempId: String, attachments: [MeeshyMessageAttachment], toStoredPaths storedPaths: [String]) async {
            calls.append((tempId, attachments.map(\.id), storedPaths))
        }
    }

    private func makeAttachment(id: String, mimeType: String, source: URL) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: source.lastPathComponent,
            originalName: source.lastPathComponent,
            mimeType: mimeType,
            fileSize: 42,
            fileUrl: source.absoluteString,
            thumbnailUrl: mimeType.hasPrefix("image/") ? source.absoluteString : nil,
            duration: mimeType.hasPrefix("image/") ? nil : 12_000,
            uploadedBy: "me"
        )
    }

    private func makeVisualGroup(tempId: String, attachments: [MeeshyMessageAttachment]) -> OutgoingMediaGroup {
        OutgoingMediaGroup(
            group: MultiAttachmentSendPlanner.PlannedMessage(kind: .visual, attachments: attachments, text: nil, carriesReply: false),
            tempId: tempId,
            locals: attachments
        )
    }

    // MARK: - L'enfilage hors ligne remet les chemins durables à la bulle

    func test_enqueueOffline_visualGroup_relocatesTheBubbleOntoTheDurableCopies() async {
        let image = makeAttachment(id: "att-img", mimeType: "image/jpeg", source: URL(fileURLWithPath: "/tmp/src/photo.jpg"))
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        let send = makeVisualGroup(tempId: "cid_offline_visual", attachments: [image, video])
        let queue = FakeOfflineMessageQueue()
        let relocator = RelocatorSpy()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: queue, relocator: relocator
        )

        let queued = await sut.enqueueOffline(send, mediaFiles: [
            "att-img": URL(fileURLWithPath: "/tmp/src/photo.jpg"),
            "att-vid": URL(fileURLWithPath: "/tmp/src/clip.mp4")
        ])

        XCTAssertTrue(queued)
        XCTAssertEqual(relocator.calls.count, 1, "la bulle doit suivre la copie durable, la source est effacée par l'outbox")
        XCTAssertEqual(relocator.calls.first?.tempId, "cid_offline_visual")
        XCTAssertEqual(relocator.calls.first?.attachmentIds, ["att-img", "att-vid"])
        XCTAssertEqual(relocator.calls.first?.storedPaths, [
            "pending-media/cid_offline_visual/0.jpg",
            "pending-media/cid_offline_visual/1.mp4"
        ])
    }

    func test_requeueAfterOnlineFailure_visualGroup_relocatesTheBubbleToo() async {
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        let send = makeVisualGroup(tempId: "cid_requeued", attachments: [video])
        let relocator = RelocatorSpy()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: FakeOfflineMessageQueue(), relocator: relocator
        )

        let requeued = await sut.requeueAfterOnlineFailure(send, mediaFiles: ["att-vid": URL(fileURLWithPath: "/tmp/src/clip.mp4")])

        XCTAssertTrue(requeued)
        XCTAssertEqual(relocator.calls.map(\.storedPaths), [["pending-media/cid_requeued/0.mp4"]])
    }

    func test_enqueueOffline_queueFails_leavesTheBubbleAlone() async {
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        let queue = FakeOfflineMessageQueue()
        await queue.failEveryEnqueue()
        let relocator = RelocatorSpy()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: queue, relocator: relocator
        )

        let queued = await sut.enqueueOffline(
            makeVisualGroup(tempId: "cid_failed", attachments: [video]),
            mediaFiles: ["att-vid": URL(fileURLWithPath: "/tmp/src/clip.mp4")]
        )

        XCTAssertFalse(queued)
        XCTAssertTrue(relocator.calls.isEmpty)
    }

    // MARK: - La ligne GRDB pointe la copie durable, qui survit à une relance

    func test_relocate_rewritesThePersistedBubbleOntoTheDurableFiles() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let store = MessagePersistenceActor(dbWriter: pool)
        try await store.insertOptimistic(SendingRowFixture.record(localId: "cid_grdb", conversationId: Self.conversationId, content: ""))
        let image = makeAttachment(id: "att-img", mimeType: "image/jpeg", source: URL(fileURLWithPath: "/tmp/src/photo.jpg"))
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        try await store.updateAttachmentsJson(localId: "cid_grdb", attachmentsJson: JSONEncoder().encode([image, video]))

        await PendingBubbleMediaRelocator(persistence: store).relocate(
            tempId: "cid_grdb",
            attachments: [image, video],
            toStoredPaths: ["pending-media/cid_grdb/0.jpg", "pending-media/cid_grdb/1.mp4"]
        )

        let record = try await pool.read { db in try MessageRecord.fetchOne(db, key: "cid_grdb") }
        let persisted = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: XCTUnwrap(record?.attachmentsJson))
        let durableImage = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: "pending-media/cid_grdb/0.jpg")).absoluteString
        let durableVideo = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: "pending-media/cid_grdb/1.mp4")).absoluteString
        XCTAssertEqual(persisted.map(\.fileUrl), [durableImage, durableVideo])
        XCTAssertEqual(persisted.first?.thumbnailUrl, durableImage, "la vignette d'une image optimiste est le fichier lui-même")
        XCTAssertNil(persisted.last?.thumbnailUrl)
        XCTAssertEqual(persisted.last?.duration, 12_000, "la durée de la vidéo reste sur la bulle")
        XCTAssertEqual(persisted.map(\.id), ["att-img", "att-vid"])
    }

    func test_relocated_mismatchedPaths_keepsTheBubbleUntouched() {
        let image = makeAttachment(id: "att-img", mimeType: "image/jpeg", source: URL(fileURLWithPath: "/tmp/src/photo.jpg"))

        XCTAssertNil(PendingBubbleMediaRelocation.relocated([image], toStoredPaths: []))
        XCTAssertNil(PendingBubbleMediaRelocation.relocated([], toStoredPaths: []))
    }

    func test_relocatingLocalFile_keepsADistinctThumbnail() {
        let video = MeeshyMessageAttachment(
            id: "att-vid", mimeType: "video/mp4",
            fileUrl: "file:///tmp/src/clip.mp4", thumbnailUrl: "file:///tmp/src/poster.jpg"
        )

        let relocated = video.relocatingLocalFile(to: URL(fileURLWithPath: "/tmp/durable/0.mp4"))

        XCTAssertEqual(relocated.fileUrl, "file:///tmp/durable/0.mp4")
        XCTAssertEqual(relocated.thumbnailUrl, "file:///tmp/src/poster.jpg")
    }
}

private extension FakeOfflineMessageQueue {
    func failEveryEnqueue() { shouldThrow = true }
}
