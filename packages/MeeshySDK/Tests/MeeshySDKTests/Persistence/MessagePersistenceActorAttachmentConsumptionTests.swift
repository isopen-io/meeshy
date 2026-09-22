import XCTest
import GRDB
@testable import MeeshySDK

/// I4 (#7360) — `markAttachmentConsumedByAll` is the WRITE side of the
/// resolver `ConversationSocketHandler` runs against a live
/// `attachment-status:updated` event. `AttachmentConsumptionResolverTests`
/// already proves the JUDGE (which action, which count, which `byAllAt`);
/// this suite proves the WRITE actually lands on the RIGHT attachment,
/// leaves its siblings untouched, and preserves every field the judge
/// didn't ask to change — the same shape `test_applyAttachmentEnrichment_
/// patchesOnlyTargetAttachmentBlobs` already proves for enrichment.
final class MessagePersistenceActorAttachmentConsumptionTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func makeAudioAttachment(id: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id, fileName: "vn.m4a", originalName: "vn.m4a",
            mimeType: "audio/mp4", fileSize: 4_096,
            fileUrl: "https://cdn/\(id).m4a", uploadedBy: "user-x"
        )
    }

    func test_marksListenedByAll_patchesOnlyTargetAttachment_preservesOtherFields() async throws {
        var record = MessageRecordFactory.make(localId: "msg_audio", conversationId: "conv_audio")
        let attachments: [MeeshyMessageAttachment] = [
            makeAudioAttachment(id: "att_1"),
            makeAudioAttachment(id: "att_2")
        ]
        record.attachmentsJson = try JSONEncoder().encode(attachments)
        try await actor.insertOptimistic(record)

        let confirmedAt = Date(timeIntervalSince1970: 1_800_000_000)
        try await actor.markAttachmentConsumedByAll(
            messageId: "msg_audio", attachmentId: "att_1",
            action: .listened, at: confirmedAt
        )

        let rows = try actor.messages(for: "conv_audio", limit: 10)
        XCTAssertEqual(rows.count, 1)
        let updatedJson = try XCTUnwrap(rows[0].attachmentsJson)
        let updated = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: updatedJson)
        XCTAssertEqual(updated.count, 2, "attachment list size preserved")

        let att1 = try XCTUnwrap(updated.first { $0.id == "att_1" })
        XCTAssertEqual(att1.listenedByAllAt, confirmedAt)
        XCTAssertEqual(att1.consumedCount, 1)
        XCTAssertNil(att1.viewedByAllAt, "only the JUDGED action's marker is set")
        XCTAssertEqual(att1.fileUrl, "https://cdn/att_1.m4a", "unrelated fields untouched")

        let att2 = try XCTUnwrap(updated.first { $0.id == "att_2" })
        XCTAssertNil(att2.listenedByAllAt, "att_2 must stay untouched — the write targets att_1 only")
    }

    func test_marksWatchedByAll_usesTheSharedConsumedCountField() async throws {
        var record = MessageRecordFactory.make(localId: "msg_video", conversationId: "conv_video")
        let attachment = MeeshyMessageAttachment(
            id: "att_v", fileName: "clip.mp4", originalName: "clip.mp4",
            mimeType: "video/mp4", fileSize: 200_000,
            fileUrl: "https://cdn/clip.mp4", uploadedBy: "user-x"
        )
        record.attachmentsJson = try JSONEncoder().encode([attachment])
        try await actor.insertOptimistic(record)

        try await actor.markAttachmentConsumedByAll(
            messageId: "msg_video", attachmentId: "att_v",
            action: .watched, at: Date(timeIntervalSince1970: 1_800_000_100)
        )

        let rows = try actor.messages(for: "conv_video", limit: 10)
        let updated = try JSONDecoder().decode(
            [MeeshyMessageAttachment].self, from: try XCTUnwrap(rows[0].attachmentsJson)
        )
        let att = try XCTUnwrap(updated.first)
        XCTAssertNotNil(att.watchedByAllAt)
        // `consumedCount` is the field the resolver shares between listened
        // (audio) and watched (video) — see AttachmentConsumptionResolver.resolve.
        XCTAssertEqual(att.consumedCount, 1)
    }

    func test_unknownAttachmentId_isANoOp() async throws {
        var record = MessageRecordFactory.make(localId: "msg_audio2", conversationId: "conv_audio2")
        record.attachmentsJson = try JSONEncoder().encode([makeAudioAttachment(id: "att_1")])
        try await actor.insertOptimistic(record)

        // Must not throw and must not touch the existing attachment.
        try await actor.markAttachmentConsumedByAll(
            messageId: "msg_audio2", attachmentId: "does-not-exist",
            action: .listened, at: Date()
        )

        let rows = try actor.messages(for: "conv_audio2", limit: 10)
        let updated = try JSONDecoder().decode(
            [MeeshyMessageAttachment].self, from: try XCTUnwrap(rows[0].attachmentsJson)
        )
        XCTAssertNil(updated.first?.listenedByAllAt)
    }
}
