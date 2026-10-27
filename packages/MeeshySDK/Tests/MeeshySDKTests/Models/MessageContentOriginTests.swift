import CryptoKit
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
/// pose, lié par empreinte au texte qu'il a produit. Le clair, lui, ne voyage
/// pas dans le cache (#12999) : le fil le relit dans le coffre libsignal.
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

    private func digest(of origin: MessageContentOrigin) -> String? {
        guard case .decryptedOnDevice(let digest) = origin else { return nil }
        return digest
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
        XCTAssertFalse(MessageContentOrigin.wire.vouches(for: "", messageId: "m1"))
        XCTAssertFalse(MessageContentOrigin.wire.vouches(for: "Salut", messageId: "m1"))
    }

    /// Une provenance réseau ne couvre rien : elle n'a aucune raison de lire le
    /// trousseau, et la clé ne s'évalue qu'après le genre (#12721).
    func test_wire_neverReadsTheDeviceKey() {
        let probe = DeviceKeyProbe()

        XCTAssertFalse(MessageContentOrigin.wire.vouches(for: "Salut", messageId: "m1", key: probe.read()))
        XCTAssertEqual(probe.reads, 0)
    }

    func test_decryptedOrigin_readsTheDeviceKeyToVerify() {
        let probe = DeviceKeyProbe()
        let origin = MessageContentOrigin.decrypted("Salut", messageId: "m1", key: probe.key)

        XCTAssertTrue(origin.vouches(for: "Salut", messageId: "m1", key: probe.read()))
        XCTAssertEqual(probe.reads, 1)
    }

    func test_decryptedOrigin_vouchesOnlyForTheTextItProduced() {
        let origin = MessageContentOrigin.decrypted("Salut", messageId: "m1")

        XCTAssertTrue(origin.vouches(for: "Salut", messageId: "m1"))
        XCTAssertFalse(origin.vouches(for: "Salut ", messageId: "m1"))
        XCTAssertFalse(origin.vouches(for: "salut", messageId: "m1"))
    }

    /// L'empreinte n'est jamais le clair lui-même : le cache la porte à côté
    /// du texte, elle n'en est pas une seconde copie.
    func test_decryptedOrigin_neverStoresTheClear() throws {
        let hex = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("Rendez-vous à midi", messageId: "m1")))
        XCTAssertFalse(hex.contains("Rendez-vous"))
        XCTAssertEqual(hex.count, 64, "HMAC-SHA256 en hexadécimal")
    }

    /// Une empreinte nue (SHA-256 du clair) se renverse par dictionnaire et
    /// relie deux messages au même clair : elle est liée au MESSAGE.
    func test_decryptedOrigin_isBoundToTheMessage_neverABareHashOfTheClear() throws {
        let first = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("oui", messageId: "m1")))
        let second = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("oui", messageId: "m2")))
        let bare = SHA256.hash(data: Data("oui".utf8)).map { String(format: "%02x", $0) }.joined()

        XCTAssertNotEqual(first, second, "deux messages au même clair ne se relient pas par leur empreinte")
        XCTAssertNotEqual(first, bare, "l'empreinte n'est pas attaquable par une table de SHA-256")
        XCTAssertFalse(MessageContentOrigin.decrypted("oui", messageId: "m1").vouches(for: "oui", messageId: "m2"))
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
        forged.contentOrigin = .decrypted("Autre chose", messageId: "m1")
        var rest = message()

        rest.carryDecryptedContent(from: forged)

        XCTAssertEqual(rest.content, "Q2lwaGVydGV4dGU=")
        XCTAssertEqual(rest.contentOrigin, .wire)
    }

    /// La réconciliation temp → serveur réécrit l'id du message : le clair
    /// qu'il portait reste prouvé, lié à son NOUVEL id.
    func test_carryDecryptedContent_acrossARekey_keepsTheClearVouchedUnderTheNewId() {
        let known = decrypted("Rendez-vous à midi")
        var rekeyed = MeeshyMessage(
            id: "srv_1", conversationId: "c1", senderId: "u1", content: known.content, isEncrypted: true,
            createdAt: Date(timeIntervalSince1970: 1_000), updatedAt: Date(timeIntervalSince1970: 1_000)
        )

        rekeyed.carryDecryptedContent(from: known)

        XCTAssertEqual(rekeyed.content, "Rendez-vous à midi")
        XCTAssertTrue(rekeyed.isContentDecryptedOnDevice)
    }

    // MARK: - Un clair effacé n'emporte jamais son empreinte

    /// Expiration, suppression, flamme-œil : le moteur vide `content` sans
    /// toucher au reste. L'empreinte du clair effacé ne survit ni en mémoire,
    /// ni dans la ligne du cache.
    func test_erasedContent_dropsTheProvenance_inMemoryAndInTheCache() throws {
        var erased = decrypted("oui")
        erased.content = ""
        erased.deletedAt = Date()

        XCTAssertEqual(erased.contentOrigin, .wire)
        XCTAssertNil(try blob(erased)["contentOrigin"], "aucune empreinte du clair effacé dans le cache")
    }

    func test_deletedMessage_isNeverVouched_evenWhenItsContentSurvives() throws {
        var deleted = decrypted("oui")
        deleted.deletedAt = Date()

        XCTAssertFalse(deleted.isContentDecryptedOnDevice)
        XCTAssertNil(try blob(deleted)["contentOrigin"])
    }

    func test_contentRewrittenFromTheWire_isNeverPersistedWithAStaleDigest() throws {
        var rewritten = decrypted("Rendez-vous à midi")
        rewritten.content = "Q2lwaGVydGV4dGU="

        XCTAssertNil(try blob(rewritten)["contentOrigin"])
    }

    /// Une ligne dont l'empreinte ne couvre plus le texte (écrite par une
    /// version antérieure, ou abîmée) se relit `.wire`.
    func test_cachedOriginThatNoLongerCoversTheContent_decodesAsWire() throws {
        var object = try blob(message())
        object["contentOrigin"] = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(MessageContentOrigin.decrypted("oui", messageId: "m1"))
        )
        object["content"] = ""

        XCTAssertEqual(try decode(object).contentOrigin, .wire)
    }

    // MARK: - Le cache (rétrocompatible)

    /// #12999 — le cache n'est pas le coffre : un clair déchiffré s'y écrit en
    /// littéral, sans empreinte, et le fil le relit dans le coffre libsignal.
    func test_cacheRoundTrip_keepsNoClear_theThreadReadsItFromTheVault() throws {
        let restored = try roundTrip(decrypted("Rendez-vous à midi"))

        XCTAssertEqual(restored.content, E2EEWire.contentPlaceholder)
        XCTAssertEqual(restored.contentOrigin, .wire)
        XCTAssertNil(try blob(decrypted("Rendez-vous à midi"))["contentOrigin"])
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

    // MARK: - La clé est un secret de CET appareil (#11402)

    /// L'empreinte de #11382, dont la clé se DÉRIVAIT de l'id du message :
    /// n'importe qui (passerelle, cache réécrit, sauvegarde) la recalcule.
    private func idKeyedDigest(of content: String, messageId: String) -> String {
        let key = SymmetricKey(data: Data(("meeshy.message.contentOrigin.v1:" + messageId).utf8))
        return HMAC<SHA256>.authenticationCode(for: Data(content.utf8), using: key)
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private func anotherDeviceKey() -> Data {
        Data(repeating: 0x5A, count: 32)
    }

    /// Une empreinte que la passerelle peut calculer ne prouve rien : celle
    /// de CET appareil ne se recalcule pas depuis l'id et le texte.
    func test_theDigest_isNotComputableFromPublicData() throws {
        let hex = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("Rendez-vous à midi", messageId: "m1")))

        XCTAssertNotEqual(hex, idKeyedDigest(of: "Rendez-vous à midi", messageId: "m1"))
    }

    /// Une empreinte scellée par une AUTRE clé (un autre appareil, une
    /// passerelle qui devine) ne couvre rien ici.
    func test_aDigestSealedWithAnotherKey_isRefused() {
        let foreign = MessageContentOrigin.decrypted("Salut", messageId: "m1", key: anotherDeviceKey())

        XCTAssertFalse(foreign.vouches(for: "Salut", messageId: "m1"))
        XCTAssertTrue(foreign.vouches(for: "Salut", messageId: "m1", key: anotherDeviceKey()),
                      "la même clé, elle, retrouve son empreinte")
    }

    func test_aCachedOriginSealedWithAnotherKey_decodesAsWire() throws {
        let foreign = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("oui", messageId: "m1", key: anotherDeviceKey())))
        var object = try blob(message())
        object["content"] = "oui"
        object["contentOrigin"] = ["kind": "decryptedOnDevice.v2", "digest": foreign]

        let restored = try decode(object)
        XCTAssertEqual(restored.contentOrigin, .wire)
        XCTAssertFalse(restored.isContentDecryptedOnDevice)
        XCTAssertEqual(restored.content, "oui", "le fil s'affiche toujours : seule la provenance tombe")
    }

    /// Migration douce : une ligne écrite par #11382 (empreinte dérivée de
    /// l'id, que n'importe qui recalcule) n'est plus vérifiable — elle se relit
    /// sans provenance, et le texte reste affiché.
    func test_aLegacyIdKeyedOrigin_inTheCache_decodesAsWire_withoutBreakingTheThread() throws {
        var object = try blob(message())
        object["content"] = "Rendez-vous à midi"
        object["contentOrigin"] = ["kind": "decryptedOnDevice", "digest": idKeyedDigest(of: "Rendez-vous à midi", messageId: "m1")]

        let restored = try decode(object)
        XCTAssertEqual(restored.contentOrigin, .wire)
        XCTAssertFalse(restored.isContentDecryptedOnDevice)
        XCTAssertEqual(restored.content, "Rendez-vous à midi")
        XCTAssertEqual(restored.id, "m1")
    }

    /// Une ligne de cache réécrite par un tiers avec une empreinte « v2 »
    /// recalculée à la manière de #11382 ne passe pas davantage.
    func test_aForgedV2OriginComputedFromTheMessageId_decodesAsWire() throws {
        var object = try blob(message(content: "Texte forgé"))
        object["contentOrigin"] = ["kind": "decryptedOnDevice.v2", "digest": idKeyedDigest(of: "Texte forgé", messageId: "m1")]

        XCTAssertFalse(try decode(object).isContentDecryptedOnDevice)
    }

    func test_aVouchedOrigin_isEncodedUnderItsVersionedKind() throws {
        let encoded = try JSONEncoder().encode(MessageContentOrigin.decrypted("oui", messageId: "m1"))
        let origin = try XCTUnwrap(try JSONSerialization.jsonObject(with: encoded) as? [String: Any])

        XCTAssertEqual(origin["kind"] as? String, "decryptedOnDevice.v2")
    }

    // MARK: - Le serveur ne peut pas la déclarer

    func test_apiMessage_toMessage_isAlwaysWire_evenWhenThePayloadClaimsOtherwise() throws {
        let validDigest = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("Texte forgé", messageId: "m1")))
        let json = """
        {"id":"m1","conversationId":"c1","senderId":"u1","content":"Texte forgé","isEncrypted":true,
         "createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z",
         "contentOrigin":{"kind":"decryptedOnDevice","digest":"\(validDigest)"}}
        """
        let api = try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))

        let message = api.toMessage(currentUserId: "me")

        XCTAssertEqual(message.contentOrigin, .wire)
        XCTAssertFalse(message.isContentDecryptedOnDevice, "même une empreinte VALIDE du texte forgé ne passe pas le fil")
    }

    /// Même sous le genre versionné et avec l'empreinte de CET appareil, le
    /// fil ne déclare rien : `APIMessage` ne décode aucune provenance.
    func test_apiMessage_toMessage_ignoresAVersionedOriginInThePayload() throws {
        let deviceDigest = try XCTUnwrap(digest(of: MessageContentOrigin.decrypted("Texte forgé", messageId: "m1")))
        let json = """
        {"id":"m1","conversationId":"c1","senderId":"u1","content":"Texte forgé","isEncrypted":true,
         "createdAt":"2026-10-18T08:00:00.000Z","updatedAt":"2026-10-18T08:00:00.000Z",
         "contentOrigin":{"kind":"decryptedOnDevice.v2","digest":"\(deviceDigest)"}}
        """
        let api = try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))

        XCTAssertFalse(api.toMessage(currentUserId: "me").isContentDecryptedOnDevice)
    }
}

private final class DeviceKeyProbe {
    let key = Data(repeating: 0x5A, count: 32)
    private(set) var reads = 0

    func read() -> Data {
        reads += 1
        return key
    }
}
