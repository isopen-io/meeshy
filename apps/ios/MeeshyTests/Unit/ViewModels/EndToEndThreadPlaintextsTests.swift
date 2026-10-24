import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Le fil pose le clair que CET appareil a déchiffré ou écrit, et seulement à
/// SA place (#3707) : un serveur compromis qui range un chiffré sous un autre
/// message, une autre conversation ou un autre auteur n'obtient qu'une bulle
/// scellée.
final class EndToEndThreadPlaintextsTests: XCTestCase {
    private let conversationId = "00000000000000000000cd01"
    private let peer = "00000000000000000000cd77"

    private func sealed(id: String = "m1", clientMessageId: String? = "cid_1", senderUserId: String? = nil) -> MeeshyMessage {
        MeeshyMessage(
            id: id, clientMessageId: clientMessageId, conversationId: conversationId, senderId: "p1",
            content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee", senderUserId: senderUserId ?? peer
        )
    }

    private func content(_ text: String, conversation: String? = nil, clientMessageId: String? = "cid_1", language: String? = "es") -> E2EEContent {
        E2EEContent(text: text, language: language, replyTo: nil, conversationId: conversation ?? conversationId, clientMessageId: clientMessageId, sentAt: Date())
    }

    func test_aMessageOpenedOnThisDevice_readsItsPlaintext_inItsLanguage() {
        var messages = [sealed()]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Hola"), senderUserId: peer)], to: &messages, conversationId: conversationId)

        XCTAssertEqual(messages[0].content, "Hola")
        XCTAssertTrue(messages[0].isContentDecryptedOnDevice, "la traduction sur l'appareil reconnaît ce clair")
        XCTAssertEqual(messages[0].originalLanguage, "es")
    }

    func test_myOwnMessage_isFoundUnderItsClientIdentifier_beforeTheServerOne() {
        var messages = [sealed(id: "srv1", senderUserId: "me")]

        EndToEndThreadPlaintexts.apply(["cid_1": .readable(content("Moi"), senderUserId: "me")], to: &messages, conversationId: conversationId)

        XCTAssertEqual(messages[0].content, "Moi")
    }

    func test_aPlaintextOfAnotherConversation_staysSealed() {
        var messages = [sealed()]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Ailleurs", conversation: "other"), senderUserId: peer)], to: &messages, conversationId: conversationId)

        XCTAssertEqual(messages[0].content, E2EEWire.contentPlaceholder)
        XCTAssertFalse(messages[0].isContentDecryptedOnDevice)
    }

    func test_aPlaintextOfAnotherAuthor_staysSealed() {
        var messages = [sealed(senderUserId: "me")]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Usurpé"), senderUserId: peer)], to: &messages, conversationId: conversationId)

        XCTAssertFalse(messages[0].isContentDecryptedOnDevice, "le serveur ne m'attribue pas le message de mon correspondant")
    }

    /// Une ligne GRDB d'un pair ne porte pas `senderUserId` (`MessageRecord.toMessage`
    /// ne le pose que pour le lecteur) : son auteur annoncé est son `senderId`,
    /// l'utilisateur résolu à l'ingestion. Un serveur qui présente MON message
    /// comme celui du pair n'obtient qu'une bulle scellée (#11232, #12757).
    func test_aStoreRowWithoutSenderUserId_isJudgedByItsSenderId() {
        var messages = [storeRow(senderId: peer)]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Moi"), senderUserId: "me")], to: &messages, conversationId: conversationId)

        XCTAssertFalse(messages[0].isContentDecryptedOnDevice, "mon clair n'est jamais attribué à mon correspondant")
        XCTAssertEqual(messages[0].content, E2EEWire.contentPlaceholder)
    }

    func test_aStoreRowOfThePeer_opensUnderItsSenderId() {
        var messages = [storeRow(senderId: peer)]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Hola"), senderUserId: peer)], to: &messages, conversationId: conversationId)

        XCTAssertEqual(messages[0].content, "Hola")
    }

    func test_aMessageWithoutAnyAnnouncedAuthor_staysSealed() {
        var messages = [storeRow(senderId: "")]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Hola"), senderUserId: peer)], to: &messages, conversationId: conversationId)

        XCTAssertFalse(messages[0].isContentDecryptedOnDevice)
    }

    private func storeRow(senderId: String) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", clientMessageId: "cid_1", conversationId: conversationId, senderId: senderId,
            content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee"
        )
    }

    func test_aPlaintextWrittenForAnotherMessage_staysSealed() {
        var messages = [sealed(clientMessageId: "cid_2")]

        EndToEndThreadPlaintexts.apply(["m1": .readable(content("Autre"), senderUserId: peer)], to: &messages, conversationId: conversationId)

        XCTAssertFalse(messages[0].isContentDecryptedOnDevice)
    }

    func test_anUndecryptableMessage_staysSealed() {
        var messages = [sealed()]

        EndToEndThreadPlaintexts.apply(["m1": .undecryptable], to: &messages, conversationId: conversationId)

        XCTAssertEqual(messages[0].content, E2EEWire.contentPlaceholder)
    }

    func test_onlySealedMessages_areLookedUp() {
        let clear = MeeshyMessage(id: "m2", conversationId: conversationId, senderId: "p1", content: "clair")

        XCTAssertEqual(EndToEndThreadPlaintexts.lookupKeys(of: [sealed(), clear]), ["m1", "cid_1"])
    }
}
