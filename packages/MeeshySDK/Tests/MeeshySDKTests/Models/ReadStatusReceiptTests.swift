import XCTest
@testable import MeeshySDK

/// #7433 — la règle unique des deux réducteurs iOS de `read-status:updated`,
/// et la guérison par le REST des coches déjà fausses.
final class ReadStatusReceiptTests: XCTestCase {

    // MARK: - describedMessageId

    func test_describedMessageId_namedSummary_winsOverTheLatestMessage() {
        let summary = ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: "named")
        XCTAssertEqual(ReadStatusReceipt.describedMessageId(of: summary, latestMessageId: "latest"), "named")
    }

    func test_describedMessageId_unnamedSummary_describesTheLatestMessage() {
        let summary = ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 0)
        XCTAssertEqual(ReadStatusReceipt.describedMessageId(of: summary, latestMessageId: "latest"), "latest")
    }

    func test_describedMessageId_zeroDenominator_describesNothing() {
        let summary = ReadStatusSummary(totalMembers: 0, deliveredCount: 0, readCount: 0, messageId: "named")
        XCTAssertNil(ReadStatusReceipt.describedMessageId(of: summary, latestMessageId: "latest"))
    }

    // MARK: - merged

    func test_merged_olderSummary_neverLowersCounters() {
        let current = ReadStatusReceipt.Counters(deliveredCount: 2, readCount: 2, recipientCount: 2, readByAllAt: nil)
        let next = ReadStatusReceipt.merged(current, with: ReadStatusSummary(totalMembers: 2, deliveredCount: 1, readCount: 0))
        XCTAssertEqual(next.deliveredCount, 2)
        XCTAssertEqual(next.readCount, 2)
    }

    func test_merged_adoptsTheServedDenominator() {
        let current = ReadStatusReceipt.Counters(deliveredCount: 0, readCount: 0, recipientCount: 0, readByAllAt: nil)
        let next = ReadStatusReceipt.merged(current, with: ReadStatusSummary(totalMembers: 4, deliveredCount: 1, readCount: 1))
        XCTAssertEqual(next.recipientCount, 4)
    }

    func test_merged_keepsAKnownReadByAllAt() {
        let known = Date(timeIntervalSince1970: 1_000)
        let current = ReadStatusReceipt.Counters(deliveredCount: 1, readCount: 1, recipientCount: 1, readByAllAt: known)
        let next = ReadStatusReceipt.merged(
            current,
            with: ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, readByAllAt: Date(timeIntervalSince1970: 2_000))
        )
        XCTAssertEqual(next.readByAllAt, known)
    }

    // MARK: - adoptServedReceipts (REST)

    private func corruptedReadRecord() -> MessageRecord {
        var record = MessageRecordFactory.make(senderId: "user_me", state: .read)
        record.serverId = "srv"
        record.readByAllAt = Date(timeIntervalSince1970: 1_000)
        record.deliveredToAllAt = Date(timeIntervalSince1970: 900)
        return record
    }

    /// La guérison : une bulle gravée « Lu » par l'ancien chemin temps réel
    /// retombe sur ce que le serveur sert — ce que la fiche « Vu par » affiche.
    func test_adoptServedReceipts_servedDenominator_undoesAFalseRead() {
        var record = corruptedReadRecord()
        record.adoptServedReceipts(
            deliveredCount: 1, readCount: 0, recipientCount: 1,
            deliveredToAllAt: nil, readByAllAt: nil, computedState: .delivered
        )
        XCTAssertNil(record.readByAllAt)
        XCTAssertEqual(record.state, .delivered)
        XCTAssertEqual(record.toMessage(currentUserId: "user_me").deliveryStatus, .delivered)
    }

    func test_adoptServedReceipts_servedDenominator_keepsARealRead() {
        var record = corruptedReadRecord()
        record.adoptServedReceipts(
            deliveredCount: 1, readCount: 1, recipientCount: 1,
            deliveredToAllAt: nil, readByAllAt: nil, computedState: .delivered
        )
        XCTAssertEqual(record.toMessage(currentUserId: "user_me").deliveryStatus, .read)
    }

    /// Sans dénominateur, la passerelle n'a rien calculé : rien de confirmé
    /// n'est effacé.
    func test_adoptServedReceipts_withoutDenominator_keepsConfirmedMarkers() {
        var record = corruptedReadRecord()
        record.adoptServedReceipts(
            deliveredCount: 0, readCount: 0, recipientCount: nil,
            deliveredToAllAt: nil, readByAllAt: nil, computedState: .sent
        )
        XCTAssertNotNil(record.readByAllAt)
        XCTAssertEqual(record.state, .read)
    }

    func test_adoptServedReceipts_inFlightRow_advancesToSent() {
        var record = MessageRecordFactory.make(senderId: "user_me", state: .sending)
        record.adoptServedReceipts(
            deliveredCount: 0, readCount: 0, recipientCount: 1,
            deliveredToAllAt: nil, readByAllAt: nil, computedState: .sent
        )
        XCTAssertEqual(record.state, .sent)
    }

    // MARK: - ConversationSyncEngine.applyReadReceipt (cache)

    private func own(_ id: String, at seconds: TimeInterval, status: MeeshyMessage.DeliveryStatus = .sent) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c", senderId: "user_me", content: id,
                      createdAt: Date(timeIntervalSince1970: seconds), deliveryStatus: status, isMe: true)
    }

    private func theirs(_ id: String, at seconds: TimeInterval) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c", senderId: "user_peer", content: id,
                      createdAt: Date(timeIntervalSince1970: seconds), deliveryStatus: .sent, isMe: false)
    }

    func test_cacheApplyReadReceipt_namedSummary_movesOnlyTheNamedBubble() {
        let messages = [own("m1", at: 1), own("m2", at: 2), own("m3", at: 3)]
        let updated = ConversationSyncEngine.applyReadReceipt(
            to: messages,
            summary: ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1, messageId: "m1")
        )
        XCTAssertEqual(updated.map(\.deliveryStatus), [.read, .sent, .sent])
    }

    func test_cacheApplyReadReceipt_latestIsThePeers_leavesMineUntouched() {
        let messages = [own("mine", at: 1), theirs("theirs", at: 2)]
        let updated = ConversationSyncEngine.applyReadReceipt(
            to: messages,
            summary: ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1)
        )
        XCTAssertEqual(updated[0].deliveryStatus, .sent)
        XCTAssertEqual(updated[0].readCount, 0)
    }

    func test_cacheApplyReadReceipt_partialGroupRead_staysDelivered() {
        let updated = ConversationSyncEngine.applyReadReceipt(
            to: [own("g", at: 1)],
            summary: ReadStatusSummary(totalMembers: 3, deliveredCount: 3, readCount: 1, messageId: "g")
        )
        XCTAssertEqual(updated[0].deliveryStatus, .delivered)
        XCTAssertEqual(updated[0].recipientCount, 3)
    }

    func test_cacheApplyReadReceipt_neverDowngradesARead() {
        let updated = ConversationSyncEngine.applyReadReceipt(
            to: [own("m", at: 1, status: .read)],
            summary: ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 0, messageId: "m")
        )
        XCTAssertEqual(updated[0].deliveryStatus, .read)
    }
}
