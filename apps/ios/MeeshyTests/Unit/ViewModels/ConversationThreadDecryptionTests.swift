import XCTest
import MeeshySDK
@testable import Meeshy

/// Le fil déchiffre les lignes GRDB d'une conversation directe (#11232, B1 de
/// la revue de #12722). Une ligne d'un PAIR ne porte pas `senderUserId` :
/// `MessageRecord.toMessage` ne le pose que pour MES messages, et son
/// `senderId` est déjà l'identifiant utilisateur résolu à l'ingestion.
@MainActor
final class ConversationThreadDecryptionTests: XCTestCase {

    func test_storeRowOfPeerEncryptedMessage_buildsAPayloadUnderThePeerUserId() throws {
        var record = SendingRowFixture.record(localId: "000000000000000000000a01", conversationId: "000000000000000000000c01")
        record.serverId = "000000000000000000000a01"
        record.senderId = "user-other"
        record.isEncrypted = true
        record.content = Data([1, 2, 3, 4]).base64EncodedString()
        let message = record.toMessage(currentUserId: "user-me")

        let payload = try XCTUnwrap(DecryptionPayload(decrypting: message))

        XCTAssertEqual(payload.senderId, "user-other")
    }
}
