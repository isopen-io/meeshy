import XCTest
@testable import MeeshySDK

/// La SEULE construction d'une demande de déchiffrement depuis un message
/// (#11232) : le fil et l'aperçu d'appui long l'appellent tous deux. La clé
/// se cherche sous le PAIR que la conversation directe connaît localement ;
/// l'auteur que le message annonce ne sert qu'à refuser ce qui n'est ni du
/// pair ni du lecteur (#12757, M1).
final class DecryptionPayloadMessageTests: XCTestCase {

    private let ciphertext = Data([0x01, 0x02, 0x03, 0x04])
    private let peer = DirectSessionPeer(peerUserId: "user-bob", readerUserId: "user-me")!

    private func makeMessage(
        senderId: String = "participant-bob",
        senderUserId: String? = "user-bob",
        content: String? = nil,
        isEncrypted: Bool = true,
        deletedAt: Date? = nil
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "000000000000000000000a01",
            conversationId: "000000000000000000000c01",
            senderId: senderId,
            content: content ?? ciphertext.base64EncodedString(),
            deletedAt: deletedAt,
            isEncrypted: isEncrypted,
            senderUserId: senderUserId
        )
    }

    // MARK: - La clé du pair, quel que soit le chemin d'arrivée

    /// REST et socket : `senderId` est le Participant, l'utilisateur est dans `senderUserId`.
    func test_init_wireMessageOfThePeer_looksTheSessionUpUnderThePeer() {
        let payload = DecryptionPayload(decrypting: makeMessage(), under: peer)

        XCTAssertEqual(payload?.senderId, "user-bob")
        XCTAssertEqual(payload?.messageId, "000000000000000000000a01")
        XCTAssertEqual(payload?.ciphertext, ciphertext)
    }

    /// Ligne GRDB d'un pair : `senderUserId` absent, `senderId` est déjà l'utilisateur (B1).
    func test_init_storeRowOfThePeer_withoutSenderUserId_looksTheSessionUpUnderThePeer() {
        let row = makeMessage(senderId: "user-bob", senderUserId: nil)

        XCTAssertEqual(DecryptionPayload(decrypting: row, under: peer)?.senderId, "user-bob")
    }

    /// Mon propre message s'ouvre avec la session du pair : c'est la clé
    /// symétrique sous laquelle `encryptMessage(_:for: peer)` l'a scellé (m3).
    func test_init_readersOwnMessage_opensUnderThePeerSession() {
        let mine = makeMessage(senderId: "user-me", senderUserId: "user-me")

        XCTAssertEqual(DecryptionPayload(decrypting: mine, under: peer)?.senderId, "user-bob",
                       "jamais sous le lecteur : aucune session n'est rangée sous soi")
    }

    // MARK: - L'auteur annoncé ne choisit jamais la clé

    /// Un message qui se dit d'un tiers dans une directe n'est ni ouvert ni
    /// présenté comme un clair ordinaire : il reste scellé (#12757, M1).
    func test_init_authorNeitherPeerNorReader_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(senderId: "participant-eve", senderUserId: "user-eve"), under: peer))
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(senderId: "user-eve", senderUserId: nil), under: peer))
    }

    /// Le REST sans enveloppe d'expéditeur ne porte que le Participant : il ne
    /// désigne ni le pair ni le lecteur, donc rien ne s'ouvre.
    func test_init_wireMessageWithoutSenderUser_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(senderUserId: nil), under: peer))
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(senderUserId: ""), under: peer))
    }

    // MARK: - Le pair local inconnu : aucune demande (fail-closed)

    func test_peer_unknownOrDegenerate_isNil() {
        XCTAssertNil(DirectSessionPeer(peerUserId: nil, readerUserId: "user-me"))
        XCTAssertNil(DirectSessionPeer(peerUserId: "", readerUserId: "user-me"))
        XCTAssertNil(DirectSessionPeer(peerUserId: "user-bob", readerUserId: nil))
        XCTAssertNil(DirectSessionPeer(peerUserId: "user-bob", readerUserId: ""))
        XCTAssertNil(DirectSessionPeer(peerUserId: "user-me", readerUserId: "user-me"),
                     "un direct gravé sous le lecteur n'a pas de pair")
    }

    // MARK: - Rien à déchiffrer

    func test_init_plainMessage_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(content: "Bonjour", isEncrypted: false), under: peer))
    }

    func test_init_deletedMessage_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(deletedAt: Date(timeIntervalSince1970: 1)), under: peer))
    }

    func test_init_emptyOrNonBase64Ciphertext_isNil() {
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(content: ""), under: peer))
        XCTAssertNil(DecryptionPayload(decrypting: makeMessage(content: "pas du base64 !"), under: peer))
    }

    func test_init_plaintextAlreadyProvenOnDevice_isNil() {
        var decrypted = makeMessage()
        decrypted.adoptDecryptedContent("Rendez-vous à midi")

        XCTAssertNil(DecryptionPayload(decrypting: decrypted, under: peer), "un clair prouvé ne repasse pas par le déchiffreur")
        XCTAssertFalse(decrypted.awaitsOnDeviceDecryption)
    }

    func test_awaitsOnDeviceDecryption_dependsOnTheShapeOnly_notOnTheAuthor() {
        XCTAssertTrue(makeMessage(senderUserId: "user-eve").awaitsOnDeviceDecryption)
        XCTAssertFalse(makeMessage(content: "Bonjour", isEncrypted: false).awaitsOnDeviceDecryption)
    }
}
