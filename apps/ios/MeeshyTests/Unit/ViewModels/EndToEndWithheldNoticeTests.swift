import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Un message chiffré que cet appareil ne montre pas dit POURQUOI** (IOS-04,
/// #18947) — au lieu du littéral `[Encrypted]` que la passerelle sert, le même
/// pour quatre situations : rien n'est arrivé, la copie d'un de mes appareils
/// attend l'approbation, le message attend une mise à jour, il est illisible.
@MainActor
final class EndToEndWithheldNoticeTests: XCTestCase {
    private let conversationId = "00000000000000000000cd01"
    private let peer = "00000000000000000000cd77"

    private func sealed(isMe: Bool = false) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", clientMessageId: "cid_1", conversationId: conversationId, senderId: "p1",
            content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee",
            senderUserId: isMe ? "me" : peer, isMe: isMe
        )
    }

    private func kept(version: Int?) -> E2EEPlaintextEntry {
        .awaitsUpgrade(E2EEKeptPlaintext(
            bytes: Data(#"{"conversationId":"x","sentAt":1,"v":2}"#.utf8), version: version, isSignal: false,
            conversationId: conversationId, senderUserId: peer, senderDeviceId: 1
        ))
    }

    // MARK: - Les mots

    func test_eachState_hasItsOwnWords_neverTheServedLiteral() {
        let texts = EndToEndWithheldNotice.allCases.map(\.text)

        XCTAssertEqual(Set(texts).count, EndToEndWithheldNotice.allCases.count, "quatre états, quatre phrases")
        XCTAssertFalse(texts.contains(E2EEWire.contentPlaceholder))
        XCTAssertFalse(texts.contains(where: \.isEmpty))
    }

    // MARK: - Ce que le coffre sait

    func test_aFutureVersionKept_asksForAnUpdate() {
        XCTAssertEqual(EndToEndWithheldNotice.of(sealed(), entry: kept(version: 2)), .updateRequired)
    }

    func test_aFormThisVersionCannotRead_isUnreadable() {
        XCTAssertEqual(EndToEndWithheldNotice.of(sealed(), entry: kept(version: nil)), .unreadable)
    }

    func test_anUndecryptableMessage_isUnreadable() {
        XCTAssertEqual(EndToEndWithheldNotice.of(sealed(), entry: .undecryptable), .unreadable)
    }

    func test_aClearNotInPlace_isUnreadable() {
        let elsewhere = E2EEContent(text: "x", language: "fr", replyTo: nil, conversationId: "ailleurs", clientMessageId: "cid_1", sentAt: Date())

        XCTAssertEqual(EndToEndWithheldNotice.of(sealed(), entry: .readable(elsewhere, senderUserId: peer)), .unreadable)
    }

    func test_nothingYetFromAPeer_isPending() {
        XCTAssertEqual(EndToEndWithheldNotice.of(sealed(), entry: nil), .pending)
    }

    func test_nothingYetForMyOwnMessage_awaitsTheApprovalBetweenMyDevices() {
        XCTAssertEqual(EndToEndWithheldNotice.of(sealed(isMe: true), entry: nil), .awaitingApproval)
    }

    // MARK: - La cellule

    func test_theCell_saysUpdateRequired_insteadOfTheServedLiteral() async {
        let endToEnd = MockEndToEndMessaging()
        endToEnd.store(kept(version: 2), for: "m1")
        var messages = [sealed()]
        let clear = EndToEndThreadClear()

        await clear.resolve(&messages, from: endToEnd, conversationId: conversationId, account: "me")
        var cell = sealed()
        clear.apply(to: &cell, conversationId: conversationId)

        XCTAssertEqual(cell.content, EndToEndWithheldNotice.updateRequired.text)
    }

    func test_theCell_saysPending_whenNothingArrived() {
        var cell = sealed()

        EndToEndThreadClear().apply(to: &cell, conversationId: conversationId)

        XCTAssertEqual(cell.content, EndToEndWithheldNotice.pending.text)
    }

    func test_theCell_stillReadsAnAdoptedClear() async {
        let endToEnd = MockEndToEndMessaging()
        let content = E2EEContent(text: "Hola", language: "es", replyTo: nil, conversationId: conversationId, clientMessageId: "cid_1", sentAt: Date())
        endToEnd.store(.readable(content, senderUserId: peer), for: "m1")
        var messages = [sealed()]
        let clear = EndToEndThreadClear()

        await clear.resolve(&messages, from: endToEnd, conversationId: conversationId, account: "me")
        var cell = sealed()
        clear.apply(to: &cell, conversationId: conversationId)

        XCTAssertEqual(cell.content, "Hola")
    }
}
