import XCTest
import GRDB
@testable import MeeshySDK

/// #7433 — un `read-status:updated` ne touche que le message qu'il DÉCRIT, et
/// seulement si l'utilisateur courant en est l'auteur. Il avançait auparavant
/// toutes les lignes de la conversation créées avant l'instant d'ÉMISSION de
/// l'événement, et y gravait `.read` + `readByAllAt` : de faux « Lu » que la
/// fiche « Vu par » démentait, et qu'aucun rafraîchissement ne défaisait.
final class MessagePersistenceActorReadStatusReceiptTests: XCTestCase {

    private let me = "user_me"
    private let peer = "user_peer"
    private let conversationId = "conv_receipts"

    private func makeSUT() async throws -> MessagePersistenceActor {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        let actor = MessagePersistenceActor(dbWriter: dbQueue, currentUserId: me)
        await actor.start()
        return actor
    }

    private func seed(
        _ actor: MessagePersistenceActor,
        serverId: String,
        senderId: String,
        createdAt: Date
    ) async throws {
        var record = MessageRecordFactory.make(
            localId: "local_\(serverId)",
            conversationId: conversationId,
            senderId: senderId,
            state: .sent,
            createdAt: createdAt
        )
        record.serverId = serverId
        try await actor.insertOptimistic(record)
    }

    private func row(_ actor: MessagePersistenceActor, _ serverId: String) throws -> MessageRecord? {
        try actor.messages(for: conversationId, limit: 50).first { $0.serverId == serverId }
    }

    private func deliveryStatus(_ actor: MessagePersistenceActor, _ serverId: String) throws -> MeeshyMessage.DeliveryStatus? {
        guard let message = try row(actor, serverId)?.toMessage(currentUserId: me) else { return nil }
        return DeliveryStatusResolver.resolve(
            status: message.deliveryStatus,
            deliveredCount: message.deliveredCount,
            readCount: message.readCount,
            recipientCount: message.recipientCount,
            deliveredToAllAt: message.deliveredToAllAt,
            readByAllAt: message.readByAllAt
        )
    }

    private func receive(_ actor: MessagePersistenceActor, _ summary: ReadStatusSummary) async throws {
        await actor.bufferReadStatusSummary(conversationId: conversationId, summary: summary, currentUserId: me)
        try await Task.sleep(nanoseconds: 300_000_000)
    }

    /// Le critère de fin de #7433 : trois résumés sur trois messages distincts,
    /// chacun ne bouge que SA bulle.
    func test_readStatusSummary_burstOnThreeMessages_eachMovesOnlyItsOwnBubble() async throws {
        let sut = try await makeSUT()
        let base = Date()
        for (offset, id) in ["m1", "m2", "m3"].enumerated() {
            try await seed(sut, serverId: id, senderId: me, createdAt: base.addingTimeInterval(Double(offset)))
        }

        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: "m1"))
        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 0, messageId: "m2"))

        XCTAssertEqual(try deliveryStatus(sut, "m1"), .read)
        XCTAssertEqual(try deliveryStatus(sut, "m2"), .delivered)
        XCTAssertEqual(try deliveryStatus(sut, "m3"), .sent,
            "un message qu'aucun résumé ne nomme garde sa coche — la lecture de m1 ne dit rien de m3")
    }

    /// Le pair ouvre le fil sur le séparateur et ne lit que le premier de mes
    /// messages : les suivants, envoyés AVANT l'événement, ne passent pas « Lu ».
    func test_readStatusSummary_namingAnOlderMessage_leavesNewerOwnMessagesUnread() async throws {
        let sut = try await makeSUT()
        let base = Date().addingTimeInterval(-60)
        try await seed(sut, serverId: "old", senderId: me, createdAt: base)
        try await seed(sut, serverId: "new", senderId: me, createdAt: base.addingTimeInterval(10))

        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: "old"))

        XCTAssertEqual(try deliveryStatus(sut, "old"), .read)
        XCTAssertEqual(try deliveryStatus(sut, "new"), .sent)
        XCTAssertNil(try row(sut, "new")?.readByAllAt)
    }

    /// Le dernier message du fil est celui du PAIR : ses compteurs disent si
    /// MOI je l'ai lu. Ils ne peignent aucun de mes messages.
    func test_readStatusSummary_describingThePeersMessage_leavesMyMessagesUntouched() async throws {
        let sut = try await makeSUT()
        let base = Date().addingTimeInterval(-60)
        try await seed(sut, serverId: "mine", senderId: me, createdAt: base)
        try await seed(sut, serverId: "theirs", senderId: peer, createdAt: base.addingTimeInterval(10))

        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: "theirs"))
        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1))

        XCTAssertEqual(try deliveryStatus(sut, "mine"), .sent)
        XCTAssertEqual(try row(sut, "mine")?.readCount, 0)
    }

    /// Passerelle d'avant #7433 : un résumé sans `messageId` décrit le dernier
    /// message ACQUITTÉ du fil — et seulement lui.
    func test_readStatusSummary_withoutMessageId_appliesToTheLatestAckedMessageOnly() async throws {
        let sut = try await makeSUT()
        let base = Date().addingTimeInterval(-60)
        try await seed(sut, serverId: "first", senderId: me, createdAt: base)
        try await seed(sut, serverId: "latest", senderId: me, createdAt: base.addingTimeInterval(10))

        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 0))

        XCTAssertEqual(try deliveryStatus(sut, "latest"), .delivered)
        XCTAssertEqual(try deliveryStatus(sut, "first"), .sent)
    }

    /// Groupe : un lecteur sur trois laisse la bulle sous « Lu » — le
    /// dénominateur ADOPTÉ rend la règle tout-ou-rien applicable à une ligne
    /// qui n'en portait aucun.
    func test_readStatusSummary_partialGroupRead_staysBelowRead() async throws {
        let sut = try await makeSUT()
        try await seed(sut, serverId: "g1", senderId: me, createdAt: Date())

        try await receive(sut, ReadStatusSummary(totalMembers: 3, deliveredCount: 3, readCount: 1, messageId: "g1"))

        XCTAssertEqual(try row(sut, "g1")?.recipientCount, 3)
        XCTAssertEqual(try deliveryStatus(sut, "g1"), .delivered)
    }

    /// Deux événements du même message arrivés dans le désordre : le plus
    /// ancien ne fait pas reculer la coche.
    func test_readStatusSummary_olderEventAfterNewer_neverLowersCounters() async throws {
        let sut = try await makeSUT()
        try await seed(sut, serverId: "m", senderId: me, createdAt: Date())

        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: "m"))
        try await receive(sut, ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 0, messageId: "m"))

        XCTAssertEqual(try row(sut, "m")?.readCount, 1)
        XCTAssertEqual(try deliveryStatus(sut, "m"), .read)
    }

    /// Un dénominateur nul est aussi ce que la passerelle rend sur son chemin
    /// d'erreur : il n'affirme rien.
    func test_readStatusSummary_zeroDenominator_changesNothing() async throws {
        let sut = try await makeSUT()
        try await seed(sut, serverId: "m", senderId: me, createdAt: Date())

        try await receive(sut, ReadStatusSummary(totalMembers: 0, deliveredCount: 0, readCount: 0, messageId: "m"))

        XCTAssertEqual(try row(sut, "m")?.recipientCount, 0)
        XCTAssertEqual(try deliveryStatus(sut, "m"), .sent)
    }
}
