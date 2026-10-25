import XCTest
import GRDB
@testable import MeeshySDK

final class APIMessageUpsertTests: XCTestCase {

    private static let stamp = "2026-10-02T20:00:00.000Z"

    private func makeAPI(_ overrides: [String: Any] = [:]) throws -> APIMessage {
        var json: [String: Any] = [
            "id": "srv1",
            "conversationId": "conv1",
            "senderId": "participant_1",
            "content": "Hello",
            "createdAt": Self.stamp,
            "updatedAt": Self.stamp,
        ]
        overrides.forEach { json[$0.key] = $0.value }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: data)
    }

    private let context = APIMessageUpsert.Context(currentUserId: "me", preferredLanguages: [])
    private let noReply = MessagePersistenceActor.IngestedReply(served: nil, fallback: nil)
    private let noPending = APIMessageUpsert.PendingMutations(reactions: [], edits: [], deletes: [])

    private func makeQueue() throws -> DatabaseQueue {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return queue
    }

    private func makeRecord(_ api: APIMessage, localId: String, serverId: String?) -> MessageRecord {
        let columns = APIMessageUpsert.columns(for: api, context: context, encoder: JSONEncoder())
        var record = APIMessageUpsert.inserted(api: api, columns: columns, reply: noReply)
        record.localId = localId
        record.serverId = serverId
        return record
    }

    private func merge(
        _ existing: MessageRecord,
        _ api: APIMessage,
        pending: APIMessageUpsert.PendingMutations? = nil
    ) -> MessageRecord {
        let columns = APIMessageUpsert.columns(for: api, context: context, encoder: JSONEncoder())
        return APIMessageUpsert.merged(existing, api: api, columns: columns, reply: noReply, pending: pending ?? noPending)
    }

    func test_computedState_noDeliverySignal_isSent() throws {
        let api = try makeAPI()

        XCTAssertEqual(APIMessageUpsert.computedState(deliveredCount: 0, readCount: 0, api: api), .sent)
    }

    func test_computedState_deliveredCountAboveZero_isDelivered() throws {
        let api = try makeAPI()

        XCTAssertEqual(APIMessageUpsert.computedState(deliveredCount: 1, readCount: 0, api: api), .delivered)
    }

    func test_computedState_readByAllAt_isDelivered() throws {
        let api = try makeAPI(["readByAllAt": Self.stamp])

        XCTAssertEqual(APIMessageUpsert.computedState(deliveredCount: 0, readCount: 0, api: api), .delivered)
    }

    func test_effectFlags_servedNonZero_isKept() throws {
        let api = try makeAPI(["effectFlags": 4, "isBlurred": true])

        XCTAssertEqual(APIMessageUpsert.effectFlags(for: api), 4)
    }

    func test_effectFlags_servedZero_derivesBlurredViewOnceEphemeral() throws {
        let api = try makeAPI(["isBlurred": true, "isViewOnce": true, "expiresAt": Self.stamp])

        let expected: MessageEffectFlags = [.blurred, .viewOnce, .ephemeral]

        XCTAssertEqual(APIMessageUpsert.effectFlags(for: api), expected.rawValue)
    }

    func test_existingRecord_clientMessageIdRowWinsOverPendingAndDirect() throws {
        let queue = try makeQueue()
        let api = try makeAPI(["clientMessageId": "cid_1"])
        try queue.write { db in
            try self.makeRecord(api, localId: "cid_1", serverId: nil).insert(db)
            try self.makeRecord(api, localId: "temp_1", serverId: nil).insert(db)
            try self.makeRecord(api, localId: "srv1", serverId: "srv1").insert(db)
            try PendingIdRecord(localId: "temp_1", serverId: "srv1", conversationId: "conv1", reconciledAt: Date()).save(db)
        }

        let found = try queue.read { try APIMessageUpsert.existingRecord(for: api, in: $0) }

        XCTAssertEqual(found?.localId, "cid_1")
    }

    func test_existingRecord_pendingRowWinsOverDirect() throws {
        let queue = try makeQueue()
        let api = try makeAPI()
        try queue.write { db in
            try self.makeRecord(api, localId: "temp_1", serverId: nil).insert(db)
            try self.makeRecord(api, localId: "srv1", serverId: "srv1").insert(db)
            try PendingIdRecord(localId: "temp_1", serverId: "srv1", conversationId: "conv1", reconciledAt: Date()).save(db)
        }

        let found = try queue.read { try APIMessageUpsert.existingRecord(for: api, in: $0) }

        XCTAssertEqual(found?.localId, "temp_1")
    }

    func test_existingRecord_serverIdColumn_isTheLastResort() throws {
        let queue = try makeQueue()
        let api = try makeAPI()
        try queue.write { db in
            try self.makeRecord(api, localId: "legacy_local", serverId: "srv1").insert(db)
        }

        let found = try queue.read { try APIMessageUpsert.existingRecord(for: api, in: $0) }

        XCTAssertEqual(found?.localId, "legacy_local")
    }

    func test_existingRecord_noRow_isNil() throws {
        let queue = try makeQueue()
        let api = try makeAPI()

        let found = try queue.read { try APIMessageUpsert.existingRecord(for: api, in: $0) }

        XCTAssertNil(found)
    }

    func test_merged_pendingEdit_keepsLocalContentAndEditedAt() throws {
        let api = try makeAPI(["content": "server text"])
        var existing = makeRecord(api, localId: "srv1", serverId: "srv1")
        let editedAt = Date(timeIntervalSince1970: 1_000)
        existing.content = "local edit"
        existing.isEdited = true
        existing.editedAt = editedAt
        let pending = APIMessageUpsert.PendingMutations(reactions: [], edits: ["srv1"], deletes: [])

        let result = merge(existing, api, pending: pending)

        XCTAssertEqual(result.content, "local edit")
        XCTAssertTrue(result.isEdited)
        XCTAssertEqual(result.editedAt, editedAt)
    }

    func test_merged_keepLocalPlaintext_whenServerReportsEncryptedOwnMessage() throws {
        let api = try makeAPI(["content": "ciphertext", "isEncrypted": true])
        var existing = makeRecord(api, localId: "srv1", serverId: "srv1")
        existing.content = "readable"
        existing.isEncrypted = false

        let result = merge(existing, api)

        XCTAssertEqual(result.content, "readable")
        XCTAssertFalse(result.isEncrypted)
    }

    /// #12999 — l'écho d'un envoi chiffré de bout en bout ne garde jamais le
    /// clair local : il vit dans le coffre libsignal, la ligne prend le littéral.
    func test_merged_anEndToEndEcho_neverKeepsTheLocalPlaintext() throws {
        let api = try makeAPI(["content": E2EEWire.contentPlaceholder, "isEncrypted": true, "encryptionMode": E2EEWire.mode])
        var existing = makeRecord(api, localId: "cid_1", serverId: nil)
        existing.content = "mon secret"
        existing.isEncrypted = false
        existing.encryptionMode = nil

        let result = merge(existing, api)

        XCTAssertEqual(result.content, E2EEWire.contentPlaceholder)
        XCTAssertTrue(result.isEncrypted)
        XCTAssertEqual(result.encryptionMode, E2EEWire.mode)
    }

    /// #12916 — le littéral servi n'est pas un clair local : une ligne née en
    /// clair déclaré avec `[Encrypted]` redevient chiffrée, et le fil y cherche le clair.
    func test_merged_aRowBornWithTheServedLiteral_becomesEncryptedAgain() throws {
        let api = try makeAPI(["content": E2EEWire.contentPlaceholder, "isEncrypted": true, "encryptionMode": E2EEWire.mode])
        var existing = makeRecord(api, localId: "srv1", serverId: "srv1")
        existing.content = E2EEWire.contentPlaceholder
        existing.isEncrypted = false
        existing.encryptionMode = nil

        let result = merge(existing, api)

        XCTAssertTrue(result.isEncrypted)
        XCTAssertEqual(result.encryptionMode, E2EEWire.mode)
    }

    func test_merged_payloadWithoutAttachments_keepsExistingAttachments() throws {
        let api = try makeAPI()
        var existing = makeRecord(api, localId: "srv1", serverId: "srv1")
        let stored = Data("[]".utf8)
        existing.attachmentsJson = stored

        let result = merge(existing, api)

        XCTAssertEqual(result.attachmentsJson, stored)
    }

    func test_merged_openedViewOnce_doesNotResurrectDeletedAt() throws {
        let api = try makeAPI(["deletedAt": "2026-10-02T21:00:00.000Z"])
        var existing = makeRecord(api, localId: "srv1", serverId: "srv1")
        existing.viewOnceOpenedAt = Date(timeIntervalSince1970: 2_000)
        existing.deletedAt = nil

        let result = merge(existing, api)

        XCTAssertNil(result.deletedAt)
        XCTAssertNil(result.content)
    }

    func test_upsertBatch_identicalEcho_returnsNoChangedConversation() throws {
        let queue = try makeQueue()
        let api = try makeAPI()

        let first = try queue.write { try APIMessageUpsert.upsertBatch([api], context: self.context, in: $0) }
        let echo = try queue.write { try APIMessageUpsert.upsertBatch([api], context: self.context, in: $0) }

        XCTAssertEqual(first, ["conv1"])
        XCTAssertEqual(echo, [])
    }
}
