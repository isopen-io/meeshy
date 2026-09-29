import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// #8565 — la ligne d'arrivées regroupées de Meeshy Global est COMPLÉTÉE sur
/// place par le serveur : seul `message:edited` part, sans
/// `conversation:updated`. La charge porte `systemEvent` (clé, noms, compte),
/// et c'est lui que la ligne de liste compose — le `content` n'est qu'un repli
/// français. Sans lui, la ligne restait « Aïcha vient d'arriver » pendant que
/// d'autres arrivaient.
///
/// La charge part du fil RÉEL (JSON décodé comme `MessageSocketManager` le
/// décode), jamais d'un `APIMessage` construit en Swift : c'est le décodeur
/// qui doit apprendre la clé `systemEvent`.
final class ConversationSyncEngineArrivalsLineTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func makeEngine(socket: MockMessageSocket) throws -> (ConversationSyncEngine, CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let cache = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
        return (engine, cache)
    }

    private func arrivalsRow() -> MeeshyConversation {
        var row = MeeshyConversation(
            id: "c-global", identifier: "meeshy", type: .global,
            lastMessageAt: now.addingTimeInterval(-60),
            lastMessagePreview: "Aïcha vient d’arriver — dis-lui salut", lastMessageId: "m-arrivals")
        row.lastMessageNature = LastMessageNature(
            messageType: "system",
            systemEvent: LastMessageSystemEvent(
                key: "system.members-arrived",
                params: ["first": .text("Aïcha"), "second": .text(""), "third": .text(""),
                         "others": .number(0), "count": .number(1)]))
        return row
    }

    /// `emitArrivalsLineUpdate` (gateway) — clé pour clé.
    private func completion(names: [String], messageId: String = "m-arrivals") throws -> APIMessage {
        let named = names.count > 3 ? 2 : names.count
        let first = names.first ?? ""
        let second = named > 1 ? names[1] : ""
        let third = named > 2 ? names[2] : ""
        let arrivals = names.enumerated()
            .map { #"{"participantId":"p-\#($0.offset)","displayName":"\#($0.element)"}"# }
            .joined(separator: ",")
        let json = """
        {"id":"\(messageId)","conversationId":"c-global","senderId":"u-aicha","content":"repli français",
         "originalLanguage":"fr","messageType":"system","messageSource":"system",
         "createdAt":"2026-09-28T09:00:00.000Z","updatedAt":"2026-09-28T09:04:00.000Z",
         "isEdited":false,"editedAt":"2026-09-28T09:04:00.000Z",
         "metadata":{"kind":"members-arrived","arrivals":[\(arrivals)],"count":\(names.count),
                     "windowStartedAt":"2026-09-28T09:00:00.000Z"},
         "systemEvent":{"key":"system.members-arrived","params":{"first":"\(first)","second":"\(second)",
                        "third":"\(third)","others":\(names.count - named),"count":\(names.count)}}}
        """
        return try decodeWire(json)
    }

    private func decodeWire(_ json: String) throws -> APIMessage {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        return try decoder.decode(APIMessage.self, from: Data(json.utf8))
    }

    private func relay(_ message: APIMessage, into row: MeeshyConversation) async throws -> MeeshyConversation? {
        let socket = MockMessageSocket()
        let (engine, cache) = try makeEngine(socket: socket)
        try await cache.conversations.save([row], for: "list")
        await engine.startSocketRelay()

        socket.messageEdited.send(message)
        try await Task.sleep(nanoseconds: 300_000_000)

        return await cache.conversations.load(for: "list").snapshot()?.first { $0.id == row.id }
    }

    private func renderedLine(_ row: MeeshyConversation) -> String {
        let strings = ConversationPreviewStrings(language: "fr") { $0.rawValue }
        let input = ConversationPreviewInput(
            conversation: row, viewerId: "u-me", language: "fr", preferredLanguages: ["fr"], now: now)
        return ConversationPreviewComposer.render(ConversationPreviewComposer.compose(input, strings: strings), strings: strings)
    }

    func test_messageEdited_arrivalsLineCompleted_listRowSaysTheNewCountAndNames() async throws {
        let row = try await relay(completion(names: ["Tom", "Léa", "Aïcha"]), into: arrivalsRow())

        let event = try XCTUnwrap(row?.lastMessageNature?.systemEvent)
        XCTAssertEqual(event.key, "system.members-arrived")
        XCTAssertEqual(event.params["count"]?.rendered, "3")
        XCTAssertEqual(event.params["first"]?.rendered, "Tom")
        XCTAssertEqual(event.params["third"]?.rendered, "Aïcha")
        XCTAssertEqual(row?.lastMessageNature?.messageType, "system", "la nature du message reste celle d'un avis")
        XCTAssertTrue(renderedLine(try XCTUnwrap(row)).contains("system.members.arrived.three"))
    }

    func test_messageEdited_arrivalsLineOfAnotherMessage_leavesTheRowAlone() async throws {
        let row = try await relay(completion(names: ["Tom", "Aïcha"], messageId: "m-older"), into: arrivalsRow())

        XCTAssertEqual(row?.lastMessageNature?.systemEvent?.params["count"]?.rendered, "1")
    }

    // MARK: - #8633 — une ligne complétée n'est pas une édition

    func test_mutation_arrivalsLineCompleted_updatesContentWithoutMarkingEdited() throws {
        let mutation = ConversationSyncEngine.mutation(
            for: try completion(names: ["Tom", "Aïcha"]), content: "Tom et Aïcha")

        guard case let .edited(messageId, content, _, marksEdited) = mutation else {
            return XCTFail("une ligne complétée garde le chemin d'écriture du contenu")
        }
        XCTAssertEqual(messageId, "m-arrivals")
        XCTAssertEqual(content, "Tom et Aïcha")
        XCTAssertFalse(marksEdited, "isEdited: false servi ⇒ la ligne ne se grave pas « modifiée »")
    }

    func test_mutation_userEditServedEdited_marksEdited() throws {
        let edit = try decodeWire(#"{"id":"m","conversationId":"c","senderId":"u","content":"x","isEdited":true,"createdAt":"2026-09-28T09:00:00.000Z"}"#)

        guard case let .edited(_, _, _, marksEdited) = ConversationSyncEngine.mutation(for: edit, content: "x") else {
            return XCTFail("une édition reste une édition")
        }
        XCTAssertTrue(marksEdited)
    }

    func test_mutation_editWithoutTheFlag_staysAnEdit() throws {
        let edit = try decodeWire(#"{"id":"m","conversationId":"c","senderId":"u","content":"x","createdAt":"2026-09-28T09:00:00.000Z"}"#)

        guard case let .edited(_, _, _, marksEdited) = ConversationSyncEngine.mutation(for: edit, content: "x") else {
            return XCTFail("une édition reste une édition")
        }
        XCTAssertTrue(marksEdited, "une charge sans drapeau garde le sens historique de message:edited")
    }

    func test_markEdited_notMarkingEdited_updatesContentAndLeavesTheFlagDown() async throws {
        let (db, actor) = try makeStore()

        try await actor.markEdited(localId: "m-arrivals", newContent: "Tom et Aïcha",
                                   editedAt: now, marksEdited: false)

        let row = try await db.read { try MessageRecord.fetchOne($0, key: "m-arrivals") }
        XCTAssertEqual(row?.content, "Tom et Aïcha")
        XCTAssertEqual(row?.isEdited, false)
    }

    func test_markEdited_notMarkingEdited_keepsTheOrderingGuard() async throws {
        let (db, actor) = try makeStore()

        try await actor.markEdited(localId: "m-arrivals", newContent: "Tom, Léa et Aïcha",
                                   editedAt: now, marksEdited: false)
        try await actor.markEdited(localId: "m-arrivals", newContent: "Tom et Aïcha",
                                   editedAt: now.addingTimeInterval(-60), marksEdited: false)

        let row = try await db.read { try MessageRecord.fetchOne($0, key: "m-arrivals") }
        XCTAssertEqual(row?.content, "Tom, Léa et Aïcha", "une complétion en retard n'efface pas la plus récente")
    }

    func test_markEdited_byDefault_stillMarksEdited() async throws {
        let (db, actor) = try makeStore()

        try await actor.markEdited(localId: "m-arrivals", newContent: "corrigé", editedAt: now)

        let row = try await db.read { try MessageRecord.fetchOne($0, key: "m-arrivals") }
        XCTAssertEqual(row?.isEdited, true)
    }

    private func makeStore() throws -> (DatabaseQueue, MessagePersistenceActor) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        var record = MessageRecordFactory.make(localId: "m-arrivals", conversationId: "c-global",
                                               content: "Aïcha vient d’arriver", state: .delivered)
        record.messageType = "system"
        record.messageSource = "system"
        try db.write { try record.insert($0) }
        return (db, MessagePersistenceActor(dbWriter: db))
    }

    func test_decode_systemEventAbsent_leavesItNil() throws {
        let json = #"{"id":"m","conversationId":"c","senderId":"u","content":"x","createdAt":"2026-09-28T09:00:00.000Z"}"#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let message = try decoder.decode(APIMessage.self, from: Data(json.utf8))

        XCTAssertNil(message.systemEvent)
    }
}
