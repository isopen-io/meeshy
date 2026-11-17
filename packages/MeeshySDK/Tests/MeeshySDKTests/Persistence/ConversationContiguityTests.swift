import XCTest
import GRDB
@testable import MeeshySDK

/// #18929 — le filigrane de CONTIGUÏTÉ : jusqu'où la base détient le fil d'une
/// conversation sans trou. Il n'avance que sur une synchro contiguë, jamais sur
/// une insertion isolée, et ne recule pas.
final class ConversationContiguityTests: XCTestCase {

    private static let conversationId = "conv_contiguity"
    /// 2025-06-01T00:00:00Z — la fin du fil détenu.
    private let t1 = Date(timeIntervalSince1970: 1_748_736_000)

    private func makeActor() throws -> MessagePersistenceActor {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return MessagePersistenceActor(dbWriter: queue)
    }

    private func serverRow(_ id: String, at createdAt: Date, in conversationId: String = ConversationContiguityTests.conversationId) -> MessageRecord {
        var record = MessageRecordFactory.make(localId: id, conversationId: conversationId, state: .sent, createdAt: createdAt)
        record.serverId = id
        return record
    }

    private func served(_ id: String, at iso: String) throws -> APIMessage {
        let json = #"{"id":"\#(id)","conversationId":"\#(Self.conversationId)","senderId":"user_other","content":"m","createdAt":"\#(iso)"}"#
        return try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))
    }

    // MARK: - D'où repart un rattrapage

    func test_catchUpCursor_unMessageEntreSeulApresLeFil_repartDuFiligrane() {
        XCTAssertEqual(ConversationContiguity.catchUpCursor(watermark: t1, oldestHeld: t1 - 3_600, newestHeld: t1 + 7_200), t1)
    }

    /// Sans filigrane, rien n'atteste que deux messages entrés seuls se rejoignent :
    /// repartir du plus récent laissait invisible le trou entre eux.
    func test_catchUpCursor_sansFiligrane_repartDuPlusAncienMessageServeurDetenu() {
        XCTAssertEqual(ConversationContiguity.catchUpCursor(watermark: nil, oldestHeld: t1, newestHeld: t1 + 7_200), t1)
    }

    func test_catchUpCursor_neDepasseJamaisLePlusRecentDetenu() {
        XCTAssertEqual(ConversationContiguity.catchUpCursor(watermark: t1 + 60, oldestHeld: t1 - 60, newestHeld: t1), t1)
    }

    func test_catchUpCursor_rienDeDetenu_aucunRattrapage() {
        XCTAssertNil(ConversationContiguity.catchUpCursor(watermark: t1, oldestHeld: nil, newestHeld: nil))
    }

    // MARK: - Ce qu'une page des plus récents fait du filigrane

    func test_extentOfRefresh_rienNEtaitDetenu_ouvreLeFilAuPlusRecentServi() {
        let empty = ConversationContiguity.Base(watermark: nil, oldestHeld: nil, newestHeld: nil)
        XCTAssertEqual(ConversationContiguity.extent(ofRefresh: [t1 - 60, t1], over: empty), t1)
    }

    func test_extentOfRefresh_quiRejointLeBloc_lEtendAuPlusRecentServi() {
        let base = ConversationContiguity.Base(watermark: t1, oldestHeld: t1 - 3_600, newestHeld: t1 + 7_200)
        XCTAssertEqual(ConversationContiguity.extent(ofRefresh: [t1, t1 + 3_600, t1 + 7_200], over: base), t1 + 7_200)
    }

    /// Le message poussé de T9 est détenu, mais la page commence après T1 : elle
    /// ne rejoint pas le fil, l'écart reste à balayer.
    func test_extentOfRefresh_separeeDuBlocParUnEcart_laisseLeFiligrane() {
        let base = ConversationContiguity.Base(watermark: t1, oldestHeld: t1 - 3_600, newestHeld: t1 + 7_200)
        XCTAssertNil(ConversationContiguity.extent(ofRefresh: [t1 + 3_600, t1 + 7_200], over: base))
    }

    /// Sans filigrane, la page n'ouvre le fil que si elle remonte jusqu'au plus
    /// ANCIEN message serveur détenu : rejoindre le plus récent, entré seul, ne
    /// prouve rien de l'écart qui le précède.
    func test_extentOfRefresh_sansFiligrane_neRejointQueLePlusAncienDetenu() {
        let base = ConversationContiguity.Base(watermark: nil, oldestHeld: t1, newestHeld: t1 + 7_200)
        XCTAssertEqual(ConversationContiguity.extent(ofRefresh: [t1, t1 + 7_200, t1 + 7_260], over: base), t1 + 7_260)
        XCTAssertNil(ConversationContiguity.extent(ofRefresh: [t1 + 7_000, t1 + 7_200, t1 + 7_260], over: base))
    }

    func test_extentOfRefresh_pageVide_neBougeRien() {
        XCTAssertNil(ConversationContiguity.extent(ofRefresh: [], over: .init(watermark: nil, oldestHeld: nil, newestHeld: nil)))
    }

    // MARK: - Ce qu'un balayage fait du filigrane

    func test_extentOfSweep_partiDeLInterieurDuFil_lEtendJusquAuPlusRecentLu() {
        XCTAssertEqual(ConversationContiguity.extent(ofSweepFrom: t1, fetched: [t1 + 120, t1 + 60], watermark: t1 + 30), t1 + 120)
    }

    func test_extentOfSweep_vide_confirmeLeFilJusquASonDepart() {
        XCTAssertEqual(ConversationContiguity.extent(ofSweepFrom: t1, fetched: [], watermark: nil), t1)
    }

    func test_extentOfSweep_partiAuDelaDuFil_neLEtendPas() {
        XCTAssertNil(ConversationContiguity.extent(ofSweepFrom: t1 + 60, fetched: [t1 + 120], watermark: t1))
    }

    // MARK: - La table

    func test_base_litLeFiligraneEtLesMessagesServeurExtremes() async throws {
        let actor = try makeActor()
        try await actor.insertOptimistic(serverRow("srv_0", at: t1 - 600))
        try await actor.insertOptimistic(serverRow("srv_1", at: t1))
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "temp_1", conversationId: Self.conversationId, createdAt: t1 + 600)
        )
        try await actor.insertOptimistic(
            MessageRecordFactory.make(localId: "temp_0", conversationId: Self.conversationId, createdAt: t1 - 1_200)
        )
        try await ConversationContiguity.extend(Self.conversationId, to: t1 - 60, on: actor)

        let base = try await ConversationContiguity.base(of: Self.conversationId, on: actor)

        XCTAssertEqual(base.watermark, t1 - 60)
        XCTAssertEqual(base.oldestHeld, t1 - 600, "une ligne optimiste porte l'horloge de l'appareil : jamais le plus ancien message détenu")
        XCTAssertEqual(base.newestHeld, t1, "ni le plus récent")
    }

    func test_extend_neReculeJamais() async throws {
        let actor = try makeActor()
        try await ConversationContiguity.extend(Self.conversationId, to: t1 + 60, on: actor)
        try await ConversationContiguity.extend(Self.conversationId, to: t1, on: actor)

        let watermark = try await ConversationContiguity.base(of: Self.conversationId, on: actor).watermark
        XCTAssertEqual(watermark, t1 + 60)
    }

    func test_unMessageInsereSeul_neDeplacePasLeFiligrane() async throws {
        let actor = try makeActor()
        try await ConversationContiguity.extend(Self.conversationId, to: t1, on: actor)

        let pushed = try served("pushed_t9", at: "2025-06-01T02:00:00.000Z")
        try await actor.upsertFromAPIMessages([pushed])

        let base = try await ConversationContiguity.base(of: Self.conversationId, on: actor)
        XCTAssertEqual(base.newestHeld, t1 + 7_200)
        XCTAssertEqual(base.watermark, t1, "un message préchargé seul n'atteste pas que les messages d'avant lui sont détenus")
    }

    func test_forget_nOublieQueLaConversationQuitee() async throws {
        let actor = try makeActor()
        try await ConversationContiguity.extend(Self.conversationId, to: t1, on: actor)
        try await ConversationContiguity.extend("conv_kept", to: t1, on: actor)

        try await ConversationContiguity.forget(Self.conversationId, on: actor)

        let forgotten = try await ConversationContiguity.base(of: Self.conversationId, on: actor).watermark
        let kept = try await ConversationContiguity.base(of: "conv_kept", on: actor).watermark
        XCTAssertNil(forgotten)
        XCTAssertEqual(kept, t1)
    }

    /// Une base déjà remplie hérite de la frontière que le rattrapage prenait
    /// jusqu'ici — le plus récent message SERVEUR de chaque conversation.
    func test_migration_amorceChaqueConversationDetenueAuPlusRecentMessageServeur() throws {
        let queue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        MessageDatabaseMigrations.registerAll(in: &migrator)
        try migrator.migrate(queue, upTo: "messages_served_client_message_id")
        let rows = [
            serverRow("a_old", at: t1 - 60, in: "conv_a"),
            serverRow("a_new", at: t1, in: "conv_a"),
            MessageRecordFactory.make(localId: "a_temp", conversationId: "conv_a", createdAt: t1 + 600),
            MessageRecordFactory.make(localId: "b_temp", conversationId: "conv_b", createdAt: t1),
        ]
        try queue.write { db in try rows.forEach { try $0.insert(db) } }

        try MessageDatabaseMigrations.runAll(on: queue)

        let seeded = try queue.read { db in
            try Row.fetchAll(db, sql: "SELECT conversationId, contiguousUpTo FROM conversation_contiguity")
                .map { ($0["conversationId"] as String, $0["contiguousUpTo"] as Date) }
        }
        XCTAssertEqual(seeded.map { $0.0 }, ["conv_a"], "une conversation sans message serveur n'a pas de fil détenu")
        XCTAssertEqual(seeded.first?.1, t1)
    }
}
