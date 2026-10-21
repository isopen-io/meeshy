import XCTest
@testable import MeeshySDK

/// **Le clair déchiffré se reconnaît par sa PROVENANCE, jamais par sa forme**
/// (#11382, audit adversarial de #11378).
///
/// L'aperçu de liste devinait le chiffré à sa forme (base64 d'au moins 28
/// octets) : faux positif pour un clair réel en base64 valide, faux négatif
/// pour un texte que le serveur forge dans une conversation chiffrée, et tout
/// était scellé après un démarrage à froid (registre en mémoire). Le message
/// porte désormais `contentOrigin`, que SEUL le déchiffrement sur l'appareil
/// pose, lié par empreinte au texte qu'il a produit — et qui voyage dans le
/// cache.
final class MessageContentOriginTests: XCTestCase {

    private func message(content: String = "Q2lwaGVydGV4dGU=", isEncrypted: Bool = true) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u1", content: content,
            isEncrypted: isEncrypted, createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: Date(timeIntervalSince1970: 1_000)
        )
    }

    private func decrypted(_ plaintext: String) -> MeeshyMessage {
        var message = message()
        message.adoptDecryptedContent(plaintext)
        return message
    }

    private func roundTrip(_ message: MeeshyMessage) throws -> MeeshyMessage {
        try JSONDecoder().decode(MeeshyMessage.self, from: JSONEncoder().encode(message))
    }

    private func blob(_ message: MeeshyMessage) throws -> [String: Any] {
        let data = try JSONEncoder().encode(message)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func decode(_ object: [String: Any]) throws -> MeeshyMessage {
        try JSONDecoder().decode(MeeshyMessage.self, from: JSONSerialization.data(withJSONObject: object))
    }

    // MARK: - Ce que seul le déchiffrement pose

    func test_newMessage_comesFromTheWire() {
        XCTAssertEqual(message().contentOrigin, .wire)
        XCTAssertFalse(message().isContentDecryptedOnDevice)
    }

    func test_adoptDecryptedContent_servesTheClearWithItsProvenance() {
        let message = decrypted("Rendez-vous à midi")

        XCTAssertEqual(message.content, "Rendez-vous à midi")
        XCTAssertTrue(message.isContentDecryptedOnDevice)
    }

    /// Le moteur de synchronisation réécrit `content` depuis le REST (le
    /// cryptogramme) sans toucher au reste du message : la provenance ne
    /// couvre plus le texte qu'il porte.
    func test_contentRewrittenAfterDecryption_isNoLongerVouched() {
        var message = decrypted("Rendez-vous à midi")
        message.content = "Q2lwaGVydGV4dGU="

        XCTAssertFalse(message.isContentDecryptedOnDevice)
    }

    /// Un texte que le serveur forge dans une conversation chiffrée vient du
    /// fil, quelle que soit sa forme : rien ne le déclare déchiffré.
    func test_forgedClearTextFromTheServer_isNeverVouched() {
        XCTAssertFalse(message(content: "Texte forgé par le serveur").isContentDecryptedOnDevice)
    }

    /// Le faux positif de l'ancienne heuristique : un clair réel qui EST du
    /// base64 valide reste un clair déchiffré.
    func test_base64LookingPlaintext_decryptedOnDevice_isVouched() {
        let base64Clear = Data(repeating: 0x78, count: 40).base64EncodedString()

        XCTAssertTrue(decrypted(base64Clear).isContentDecryptedOnDevice)
    }

    func test_wire_neverVouchesForAnyContent() {
        XCTAssertFalse(MessageContentOrigin.wire.vouches(for: ""))
        XCTAssertFalse(MessageContentOrigin.wire.vouches(for: "Salut"))
    }

    func test_decryptedOrigin_vouchesOnlyForTheTextItProduced() {
        let origin = MessageContentOrigin.decrypted("Salut")

        XCTAssertTrue(origin.vouches(for: "Salut"))
        XCTAssertFalse(origin.vouches(for: "Salut "))
        XCTAssertFalse(origin.vouches(for: "salut"))
    }

    /// L'empreinte n'est jamais le clair lui-même : le cache la porte à côté
    /// du texte, elle n'en est pas une seconde copie.
    func test_decryptedOrigin_neverStoresTheClear() throws {
        guard case .decryptedOnDevice(let digest) = MessageContentOrigin.decrypted("Rendez-vous à midi") else {
            return XCTFail("le déchiffrement pose une provenance d'appareil")
        }
        XCTAssertFalse(digest.contains("Rendez-vous"))
        XCTAssertEqual(digest.count, 64, "SHA-256 en hexadécimal")
    }

    // MARK: - Recouvrir le cryptogramme REST par le clair connu

    func test_carryDecryptedContent_fromAVouchedCopy_restoresTheClearAndItsProvenance() {
        let known = decrypted("Rendez-vous à midi")
        var rest = message()

        rest.carryDecryptedContent(from: known)

        XCTAssertEqual(rest.content, "Rendez-vous à midi")
        XCTAssertTrue(rest.isContentDecryptedOnDevice)
    }

    func test_carryDecryptedContent_fromAnUnvouchedCopy_changesNothing() {
        var forged = message(content: "Texte forgé")
        forged.contentOrigin = .decrypted("Autre chose")
        var rest = message()

        rest.carryDecryptedContent(from: forged)

        XCTAssertEqual(rest.content, "Q2lwaGVydGV4dGU=")
        XCTAssertEqual(rest.contentOrigin, .wire)
    }

    // MARK: - Le cache (rétrocompatible)

    func test_cacheRoundTrip_keepsTheProvenance() throws {
        let restored = try roundTrip(decrypted("Rendez-vous à midi"))

        XCTAssertEqual(restored.content, "Rendez-vous à midi")
        XCTAssertTrue(restored.isContentDecryptedOnDevice, "un démarrage à froid ne scelle plus ce que l'appareil a déchiffré")
    }

    /// Une ligne écrite avant ce champ se relit `.wire` : rien n'est déclaré
    /// déchiffré par défaut (fail-closed).
    func test_legacyBlobWithoutOrigin_decodesAsWire() throws {
        var object = try blob(decrypted("Rendez-vous à midi"))
        object.removeValue(forKey: "contentOrigin")

        XCTAssertEqual(try decode(object).contentOrigin, .wire)
    }

    /// Un format futur ou abîmé ne rend jamais le message illisible : il
    /// retombe sur `.wire`.
    func test_unknownOriginKind_decodesAsWire() throws {
        var object = try blob(message())
        object["contentOrigin"] = ["kind": "futureFormat", "digest": "00"]

        let restored = try decode(object)
        XCTAssertEqual(restored.contentOrigin, .wire)
        XCTAssertEqual(restored.id, "m1")
    }

    /// Un message du fil s'encode exactement comme avant : un ancien client qui
    /// relit ce cache ne voit aucune clé nouvelle.
    func test_wireOrigin_isNotEncoded() throws {
        XCTAssertNil(try blob(message())["contentOrigin"])
    }

    // MARK: - Le serveur ne peut pas la déclarer

    func test_apiMessage_toMessage_isAlwaysWire_evenWhenThePayloadClaimsOtherwise() throws {
        let digest = String(repeating: "a", count: 64)
        let json = """
        {"id":"m1","conversationId":"c1","senderId":"u1","content":"Texte forgé","isEncrypted":true,
         "createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z",
         "contentOrigin":{"kind":"decryptedOnDevice","digest":"\(digest)"}}
        """
        let api = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))

        let message = api.toMessage(currentUserId: "me")

        XCTAssertEqual(message.contentOrigin, .wire)
        XCTAssertFalse(message.isContentDecryptedOnDevice)
    }
}
