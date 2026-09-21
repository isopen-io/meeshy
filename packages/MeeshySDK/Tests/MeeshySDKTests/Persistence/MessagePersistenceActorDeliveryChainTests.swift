import XCTest
import GRDB
@testable import MeeshySDK

/// I3 (#7349) — `batchDeliverySync` ne relit que les lignes `.sending`/`.sent`
/// (`MessagePersistenceActor.swift`), alors que `MessageStateMachine` sait
/// faire `.delivered → .read` sur `.readBy`. Un message qui a déjà basculé en
/// `.delivered` via un premier `read-status:updated` (tous délivrés) devient
/// invisible à la requête du SECOND événement (tous lus) et reste bloqué sur
/// une seule coche — la ligne ne change JAMAIS une deuxième fois, sans aucun
/// geste de l'utilisateur pour le déclencher. C'est le défaut documenté par le
/// commentaire de `ConversationSocketHandlerTests.swift` (« bufferBatchDelivery
/// only applies to rows in .sending or .sent states ») : ce commentaire
/// annonçait la restriction, aucun témoin n'enchaînait les deux transitions
/// sur la même ligne pour la faire rougir.
final class MessagePersistenceActorDeliveryChainTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
        await actor.start()
    }

    /// Délivré puis lu sur la MÊME ligne : deux changements de coche sans
    /// geste. Le premier événement porte la ligne à `.delivered` ; le second,
    /// plus tard, doit la porter à `.read` — sans que rien d'autre (rouvrir la
    /// conversation, faire défiler) ne soit nécessaire.
    func test_batchDeliverySync_deliveredThenRead_advancesToRead() async throws {
        let createdAt = Date()
        let record = MessageRecordFactory.make(
            localId: "msg_delivered_then_read",
            conversationId: "conv_chain",
            state: .sent,
            createdAt: createdAt
        )
        try await actor.insertOptimistic(record)

        let deliveredAt = createdAt.addingTimeInterval(1)
        await actor.bufferBatchDelivery(conversationId: "conv_chain", event: .delivered(count: 1, at: deliveredAt))
        try await waitForWrite()

        let afterDelivered = try actor.messages(for: "conv_chain", limit: 10).first
        XCTAssertEqual(afterDelivered?.state, .delivered, "the first event must advance sent → delivered")
        assertSameInstant(afterDelivered?.deliveredAt, deliveredAt,
            "the first event must stamp the distribution instant")

        let readAt = deliveredAt.addingTimeInterval(1)
        await actor.bufferBatchDelivery(conversationId: "conv_chain", event: .readBy(userId: "peer", at: readAt))
        try await waitForWrite()

        let afterRead = try actor.messages(for: "conv_chain", limit: 10).first
        XCTAssertEqual(afterRead?.state, .read,
            "a message already .delivered must still advance to .read on the next event — " +
            "batchDeliverySync must not silently drop rows past .sent")
        XCTAssertNotNil(afterRead?.readAt, "readAt must be stamped by the second transition")
        // Ce qui part À CÔTÉ du palier : la machine reconstruite pour le SECOND
        // événement ne connaît que `readAt`. Assignée telle quelle, elle
        // EFFAÇAIT l'instant de distribution que le premier événement venait de
        // graver — une ligne « lue » sans jamais avoir été « distribuée ». Le
        // chemin à un seul message (`applyEvent`) sème la machine et réassigne
        // en repli ; celui-ci doit faire pareil.
        assertSameInstant(afterRead?.deliveredAt, deliveredAt,
            "advancing delivered → read must PRESERVE the delivery instant, not blank it")
    }

    /// Rafale : trois messages de la même conversation, tous `.sent`, reçoivent
    /// le même enchaînement délivré → lu. Les trois doivent avancer ensemble à
    /// chaque étape — un batch qui ne couvre qu'une partie du lot serait pire
    /// que l'ancien défaut (incohérence entre bulles d'une même conversation).
    func test_batchDeliverySync_deliveredThenRead_burstOfThreeMessages_allAdvanceToRead() async throws {
        let base = Date()
        let ids = ["msg_burst_1", "msg_burst_2", "msg_burst_3"]
        for (offset, localId) in ids.enumerated() {
            let record = MessageRecordFactory.make(
                localId: localId,
                conversationId: "conv_burst",
                state: .sent,
                createdAt: base.addingTimeInterval(Double(offset))
            )
            try await actor.insertOptimistic(record)
        }

        let deliveredAt = base.addingTimeInterval(10)
        await actor.bufferBatchDelivery(conversationId: "conv_burst", event: .delivered(count: 1, at: deliveredAt))
        try await waitForWrite()

        let afterDelivered = try actor.messages(for: "conv_burst", limit: 10)
        XCTAssertEqual(afterDelivered.count, 3)
        XCTAssertTrue(afterDelivered.allSatisfy { $0.state == .delivered },
            "the burst must advance every row to .delivered")

        let readAt = base.addingTimeInterval(20)
        await actor.bufferBatchDelivery(conversationId: "conv_burst", event: .readBy(userId: "peer", at: readAt))
        try await waitForWrite()

        let afterRead = try actor.messages(for: "conv_burst", limit: 10)
        XCTAssertEqual(afterRead.count, 3)
        XCTAssertTrue(afterRead.allSatisfy { $0.state == .read },
            "every row of the burst must advance to .read on the second event, " +
            "not just the ones batchDeliverySync's stale filter still sees")
        XCTAssertTrue(afterRead.allSatisfy { $0.readAt != nil })
        for record in afterRead {
            assertSameInstant(record.deliveredAt, deliveredAt,
                "the second event must not blank the delivery instant of the burst")
        }
    }

    /// GRDB round-trips a `Date` through SQLite at second resolution: two
    /// instants that name the same moment are not `==`. Comparer les objets
    /// ferait rougir une garde JUSTE — on compare le moment.
    private func assertSameInstant(
        _ actual: Date?, _ expected: Date, _ message: String,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        guard let actual else {
            return XCTFail(message + " (nil)", file: file, line: line)
        }
        XCTAssertEqual(actual.timeIntervalSince1970, expected.timeIntervalSince1970,
                       accuracy: 1.0, message, file: file, line: line)
    }

    /// The write processor drains the buffered op asynchronously (AsyncStream).
    /// A short sleep is the same approach used by the existing socket-handler
    /// integration tests for the same actor (`ConversationSocketHandlerTests`).
    private func waitForWrite() async throws {
        try await Task.sleep(nanoseconds: 300_000_000)
    }
}
