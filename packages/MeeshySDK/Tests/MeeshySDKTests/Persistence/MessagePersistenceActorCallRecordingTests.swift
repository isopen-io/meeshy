import XCTest
import GRDB
@testable import MeeshySDK

/// #8064 — la bulle d'un appel reçoit son enregistrement par la rediffusion
/// `message:edited` : ses pièces jointes rejoignent la ligne persistée, et une
/// rediffusion sans pièce ne retire rien.
final class MessagePersistenceActorCallRecordingTests: XCTestCase {

    private func makeActor() throws -> MessagePersistenceActor {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        return MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func makeCallBubble(attachments: [[String: Any]]?) throws -> APIMessage {
        var json: [String: Any] = [
            "id": "srv_call_rec",
            "conversationId": "conv_rec",
            "senderId": "sender-1",
            "content": "Appel audio · 04:32",
            "messageSource": "system",
            "createdAt": "2026-09-27T10:00:00Z",
            "updatedAt": "2026-09-27T10:05:00Z",
        ]
        if let attachments { json["attachments"] = attachments }
        let data = try JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIMessage.self, from: data)
    }

    private let recording: [String: Any] = [
        "id": "att_rec",
        "mimeType": "audio/mp4",
        "fileUrl": "/api/v1/attachments/file/appel.m4a",
        "fileSize": 48_000,
        "duration": 272_000,
    ]

    private func insertCallBubble(into actor: MessagePersistenceActor) async throws {
        var record = MessageRecordFactory.make(localId: "cid_call_rec", conversationId: "conv_rec")
        record.serverId = "srv_call_rec"
        try await actor.insertOptimistic(record)
    }

    private func persistedAttachmentIds(_ actor: MessagePersistenceActor) throws -> [String] {
        let rows = try actor.messages(for: "conv_rec", limit: 10)
        let json = try XCTUnwrap(rows.first?.attachmentsJson)
        return try JSONDecoder().decode([MeeshyMessageAttachment].self, from: json).map(\.id)
    }

    func test_applyCallNoticeAttachments_joinsTheRecordingToTheBubble() async throws {
        let actor = try makeActor()
        try await insertCallBubble(into: actor)

        try await actor.applyCallNoticeAttachments(from: makeCallBubble(attachments: [recording]))

        let ids = try persistedAttachmentIds(actor)
        XCTAssertEqual(ids, ["att_rec"])
    }

    func test_applyCallNoticeAttachments_withoutAttachments_keepsTheLinkedRecording() async throws {
        let actor = try makeActor()
        try await insertCallBubble(into: actor)
        try await actor.applyCallNoticeAttachments(from: makeCallBubble(attachments: [recording]))

        try await actor.applyCallNoticeAttachments(from: makeCallBubble(attachments: nil))

        let ids = try persistedAttachmentIds(actor)
        XCTAssertEqual(ids, ["att_rec"])
    }
}
