import XCTest
@testable import MeeshySDK

/// La SEULE construction d'une demande de déchiffrement depuis un message
/// (#11232) : le fil et l'aperçu d'appui long l'appellent tous deux. La
/// session d'un pair est rangée sous son identifiant UTILISATEUR ; le
/// `senderId` d'un message désigne son Participant (`schema.prisma`,
/// relation `sender Participant`) et ne trouve jamais de session.
final class DecryptionPayloadMessageTests: XCTestCase {

    private let ciphertext = Data([0x01, 0x02, 0x03, 0x04])

    private func makeMessage(
        content: String? = nil,
        isEncrypted: Bool = true,
        senderUserId: String? = "user-bob",
        deletedAt: Date? = nil
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "000000000000000000000a01",
            conversationId: "000000000000000000000c01",
            senderId: "participant-bob",
            content: content ?? ciphertext.base64EncodedString(),
            deletedAt: deletedAt,
            isEncrypted: isEncrypted,
            senderUserId: senderUserId
        )
    }

    func test_init_encryptedMessage_looksTheSessionUpUnderTheSenderUserId() {
        let payload = DecryptionPayload(decrypting: makeMessage())

        XCTAssertEqual(payload?.senderId, "user-bob", "la session se cherche sous l'utilisateur, jamais sous le Participant")
        XCTAssertEqual(payload?.messageId, "000000000000000000000a01")
        XCTAssertEqual(payload?.ciphertext, ciphertext)
    }

    func test_init_unknownSenderUser_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(senderUserId: nil)))
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(senderUserId: "")))
    }

    func test_init_plainMessage_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(content: "Bonjour", isEncrypted: false)))
    }

    func test_init_deletedMessage_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(deletedAt: Date(timeIntervalSince1970: 1))))
    }

    func test_init_emptyOrNonBase64Ciphertext_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(content: "")))
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(content: "pas du base64 !")))
    }

    func test_init_plaintextAlreadyProvenOnDevice_isNil() {
        var decrypted = makeMessage()
        decrypted.adoptDecryptedContent("Rendez-vous à midi")

        XCTAssertNil(DecryptionPayload(decrypting: decrypted), "un clair prouvé ne repasse pas par le déchiffreur")
    }
}
