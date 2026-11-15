import XCTest
import GRDB
@testable import MeeshySDK

/// #9997 — un message modifié chargé par REST garde la date de modification
/// du SERVEUR, et une édition de l'appareil passe la garde d'ordre même
/// quand l'horloge de l'appareil retarde sur celle du serveur.
final class MessagePersistenceEditClockTests: XCTestCase {

    /// `2026-10-11T08:15:30Z`, la date que sert la charge REST ci-dessous.
    private static let restEditedAt = Date(timeIntervalSince1970: 1_791_706_530)

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me"), queue)
    }

    private func row(_ queue: DatabaseQueue, _ id: String) throws -> MessageRecord? {
        try queue.read { db in try MessageRecord.filter(Column("localId") == id).fetchOne(db) }
    }

    private func editedAPIMessage(id: String, content: String = "texte modifié") throws -> APIMessage {
        let json = """
        {"id":"\(id)","conversationId":"conv_clock","senderId":"p-bob","content":"\(content)",
         "createdAt":"2026-10-11T08:00:00Z","updatedAt":"2026-10-11T08:15:30Z",
         "isEdited":true,"editedAt":"2026-10-11T08:15:30Z"}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIMessage.self, from: Data(json.utf8))
    }

    private func insertSent(_ actor: MessagePersistenceActor, id: String) async throws {
        var record = MessageRecordFactory.make(localId: id, conversationId: "conv_clock", content: "avant", state: .sent)
        record.serverId = id
        try await actor.insertOptimistic(record)
    }

    // MARK: - Le chemin REST garde la date du serveur

    func test_upsertFromAPIMessages_newEditedMessage_keepsServerEditedAt() async throws {
        let (actor, queue) = try makeActor()

        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m1")])

        let stored = try XCTUnwrap(try row(queue, "m1"))
        XCTAssertTrue(stored.isEdited)
        XCTAssertEqual(stored.editedAt, Self.restEditedAt)
    }

    func test_upsertFromAPIMessages_existingRow_adoptsServerEditedAt() async throws {
        let (actor, queue) = try makeActor()
        try await insertSent(actor, id: "m2")

        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m2")])

        let stored = try XCTUnwrap(try row(queue, "m2"))
        XCTAssertEqual(stored.content, "texte modifié")
        XCTAssertEqual(stored.editedAt, Self.restEditedAt)
    }

    func test_upsertFromAPIMessages_editedMessage_sharesTheServerSourceVersion() async throws {
        let (actor, queue) = try makeActor()

        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m3")])

        let stored = try XCTUnwrap(try row(queue, "m3"))
        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: stored.editedAt),
            SharedTranslationSourceVersion.of(editedAt: Self.restEditedAt)
        )
        XCTAssertNotEqual(
            SharedTranslationSourceVersion.of(editedAt: stored.editedAt),
            SharedTranslationSourceVersion.original
        )
    }

    // MARK: - La garde d'ordre et l'horloge de l'appareil

    func test_markEditedLocally_deviceClockBehindServer_stillApplies() async throws {
        let (actor, queue) = try makeActor()
        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m4")])
        let deviceNow = Self.restEditedAt.addingTimeInterval(-300)

        let stamp = try await actor.markEditedLocally(localId: "m4", newContent: "ma correction", now: deviceNow)

        let stored = try XCTUnwrap(try row(queue, "m4"))
        XCTAssertEqual(stored.content, "ma correction")
        XCTAssertGreaterThan(try XCTUnwrap(stamp), Self.restEditedAt)
    }

    func test_markEditedLocally_rollbackWithItsStamp_restoresOriginal() async throws {
        let (actor, queue) = try makeActor()
        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m5")])
        let deviceNow = Self.restEditedAt.addingTimeInterval(-300)
        let applied = try await actor.markEditedLocally(localId: "m5", newContent: "ma correction", now: deviceNow)
        let stamp = try XCTUnwrap(applied)

        try await actor.markEdited(localId: "m5", newContent: "texte modifié", editedAt: stamp)

        XCTAssertEqual(try row(queue, "m5")?.content, "texte modifié")
    }

    func test_markEditedLocally_deviceClockAhead_usesTheDeviceClock() async throws {
        let (actor, queue) = try makeActor()
        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m6")])
        let deviceNow = Self.restEditedAt.addingTimeInterval(60)

        let stamp = try await actor.markEditedLocally(localId: "m6", newContent: "plus tard", now: deviceNow)

        XCTAssertEqual(stamp, deviceNow)
        XCTAssertEqual(try row(queue, "m6")?.content, "plus tard")
    }

    func test_markEditedLocally_unknownMessage_returnsNil() async throws {
        let (actor, _) = try makeActor()

        let stamp = try await actor.markEditedLocally(localId: "absent", newContent: "rien", now: Date())

        XCTAssertNil(stamp)
    }

    func test_markEdited_staleServerEditAfterRESTEdit_isRejected() async throws {
        let (actor, queue) = try makeActor()
        try await actor.upsertFromAPIMessages([try editedAPIMessage(id: "m7")])

        try await actor.markEdited(
            localId: "m7", newContent: "ancienne version", editedAt: Self.restEditedAt.addingTimeInterval(-60)
        )

        XCTAssertEqual(try row(queue, "m7")?.content, "texte modifié")
    }
}
