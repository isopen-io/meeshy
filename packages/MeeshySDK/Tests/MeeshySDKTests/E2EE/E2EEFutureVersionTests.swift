import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// **Un message chiffré d'une version future se garde et se relit après la mise
/// à jour** (IOS-04, #18947 ; contrat #18940, verdict `future-version`).
///
/// L'ouvreur rangeait tout verdict en « illisible » puis l'acquittait : le
/// serveur effaçait le SEUL exemplaire du chiffré, et un contenu `v: 2`
/// (pièces chiffrées) envoyé par une autre plateforme était perdu pour
/// toujours, même après la mise à jour. Un clair que libsignal a AUTHENTIFIÉ
/// mais que cette version ne sait pas lire garde désormais ses octets, scellés,
/// et le ratchet avance : le message suivant s'ouvre.
final class E2EEFutureVersionTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let conversation = "conv1"

    private func relay(_ plaintext: String, from sender: E2EETestPeer, to peer: String, on server: FakeE2EEServer, messageId: String) async throws {
        let sealed = try await sender.sealer.seal(plaintext: Data(plaintext.utf8), to: peer)
        try server.relay(sealed, from: sender.userId, conversationId: conversation, participants: [sender.userId, peer], messageId: messageId)
    }

    private func futureContent(from sender: E2EETestPeer) -> String {
        #"{"attachments":[{"id":"a1"}],"authorDeviceId":\#(sender.device.deviceId),"authorUserId":"\#(sender.userId)","conversationId":"conv1","sentAt":1790000000000,"text":"pièce jointe","v":2}"#
    }

    // MARK: - Réception

    func test_aFutureVersionContent_isKeptSealed_acknowledged_andTheNextMessageOpens() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let future = futureContent(from: aliceIPhone)
        try await relay(future, from: aliceIPhone, to: bob, on: server, messageId: "m1")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)

        let outcome = await bobIPhone.opener.receive(envelope)

        XCTAssertEqual(outcome, .awaitingUpgrade(messageId: "m1", conversationId: conversation), "jamais « illisible »")
        guard case .awaitsUpgrade(let kept)? = try bobIPhone.plaintexts.entry(for: "m1") else {
            return XCTFail("les octets clairs sont gardés")
        }
        XCTAssertEqual(kept.bytes, Data(future.utf8), "le clair, sans son remplissage")
        XCTAssertEqual(kept.version, 2)
        XCTAssertEqual(kept.senderUserId, alice)
        XCTAssertTrue(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).isEmpty, "acquitté : son clair est gardé")

        try await relay(#"{"conversationId":"conv1","sentAt":1790000000001,"text":"suivant","v":1}"#, from: aliceIPhone, to: bob, on: server, messageId: "m2")
        let next = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        guard case .opened(let opened) = bobIPhone.opener.open(next) else { return XCTFail("le ratchet a avancé : le suivant s'ouvre") }
        XCTAssertEqual(opened.content.text, "suivant")
    }

    func test_aContentDivergingFromThisVersion_isKeptWithoutAFutureVersion() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try await relay(#"{"conversationId":"conv1","replyTo":{"id":"m0"},"sentAt":1790000000000,"text":"x","v":1}"#,
                        from: aliceIPhone, to: bob, on: server, messageId: "m1")

        let outcome = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))

        XCTAssertEqual(outcome, .awaitingUpgrade(messageId: "m1", conversationId: conversation))
        guard case .awaitsUpgrade(let kept)? = try bobIPhone.plaintexts.entry(for: "m1") else { return XCTFail("gardé") }
        XCTAssertNil(kept.version, "une forme que cette version ne lit pas, sans version future annoncée")
    }

    func test_aFutureVersionSignal_isKeptNotLost() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try await relay(#"{"conversationId":"conv1","kind":"poll-vote","s":2,"sentAt":1790000000000}"#,
                        from: aliceIPhone, to: bob, on: server, messageId: "s1")

        let outcome = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))

        XCTAssertEqual(outcome, .awaitingUpgrade(messageId: "s1", conversationId: conversation))
        guard case .awaitsUpgrade(let kept)? = try bobIPhone.plaintexts.entry(for: "s1") else { return XCTFail("gardé") }
        XCTAssertTrue(kept.isSignal)
        XCTAssertEqual(kept.version, 2)
    }

    // MARK: - Ce qui reste un verdict

    func test_aForgedCiphertext_staysUndecryptable() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try await relay(futureContent(from: aliceIPhone), from: aliceIPhone, to: bob, on: server, messageId: "m1")
        let served = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        var body = try XCTUnwrap(Data(base64Encoded: served.body))
        body[body.count - 1] ^= 0xFF
        let forged = E2EEServedEnvelope(
            id: served.id, messageId: served.messageId, conversationId: served.conversationId,
            recipientRegistrationId: served.recipientRegistrationId, senderUserId: served.senderUserId,
            senderDeviceId: served.senderDeviceId, type: served.type, body: body.base64EncodedString(), createdAt: served.createdAt
        )

        XCTAssertEqual(bobIPhone.opener.open(forged), .undecryptable(messageId: "m1", conversationId: conversation),
                       "libsignal refuse : rien d'authentifié à garder")
        XCTAssertEqual(try bobIPhone.plaintexts.entry(for: "m1"), .undecryptable)
    }

    func test_aContentPresentedInAnotherConversation_staysAVerdict() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try await relay(#"{"conversationId":"conv2","sentAt":1790000000000,"text":"ailleurs","v":1}"#,
                        from: aliceIPhone, to: bob, on: server, messageId: "m1")

        let outcome = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))

        XCTAssertEqual(outcome, .undecryptable(messageId: "m1", conversationId: conversation))
    }

    // MARK: - Relecture après la mise à jour

    func test_aKeptContent_isRereadByAVersionThatKnowsItsFormat() {
        let bytes = Data(#"{"authorDeviceId":3,"authorUserId":"\#(alice)","conversationId":"conv1","sentAt":1790000000000,"text":"lu","v":2}"#.utf8)
        let kept = E2EEKeptPlaintext(bytes: bytes, version: 2, isSignal: false, conversationId: "conv1", senderUserId: alice, senderDeviceId: 3)
        let laterVersion: (Data) throws -> E2EEContent = { try JSONDecoder().decode(E2EEContent.self, from: $0) }

        guard case .readable(let content, let sender)? = kept.reread(decode: laterVersion) else {
            return XCTFail("une version qui sait lire ce format le rend lisible")
        }
        XCTAssertEqual(content.text, "lu")
        XCTAssertEqual(sender, alice)
        XCTAssertNil(kept.reread(), "cette version ne le lit pas encore")
    }

    func test_aKeptContent_isStillJudgedAtItsPlace_whenReread() {
        let bytes = Data(#"{"authorDeviceId":3,"authorUserId":"\#(alice)","conversationId":"conv2","sentAt":1790000000000,"text":"ailleurs","v":2}"#.utf8)
        let kept = E2EEKeptPlaintext(bytes: bytes, version: 2, isSignal: false, conversationId: "conv1", senderUserId: alice, senderDeviceId: 3)

        XCTAssertNil(kept.reread { try JSONDecoder().decode(E2EEContent.self, from: $0) },
                     "relu, un contenu présenté hors de sa conversation reste refusé")
    }

    func test_aKeptEntry_survivesItsRecord() throws {
        let kept = E2EEKeptPlaintext(bytes: Data("{\"v\":9}".utf8), version: 9, isSignal: false, conversationId: "conv1", senderUserId: alice, senderDeviceId: 3)

        let decoded = try JSONDecoder().decode(E2EEPlaintextEntry.self, from: JSONEncoder().encode(E2EEPlaintextEntry.awaitsUpgrade(kept)))

        XCTAssertEqual(decoded, .awaitsUpgrade(kept))
    }

    // MARK: - La version se lit avant toute autre clé

    func test_aFutureVersionOfAnyShape_isAFutureVersion() {
        XCTAssertThrowsError(try E2EEContent.decoded(from: Data(#"{"body":{"text":"x"},"v":3}"#.utf8))) { error in
            XCTAssertEqual(error as? E2EEContentError, .unsupportedVersion(3))
        }
        XCTAssertThrowsError(try E2EESignal.decoded(from: Data(#"{"op":"x","s":3}"#.utf8))) { error in
            XCTAssertEqual(error as? E2EESignalError, .unsupportedVersion(3))
        }
    }

    func test_aVersionBelowTheFirst_isNotAFutureVersion() {
        XCTAssertThrowsError(try E2EEContent.decoded(from: Data(#"{"sentAt":1,"v":0}"#.utf8))) { error in
            XCTAssertNotEqual(error as? E2EEContentError, .unsupportedVersion(0))
        }
    }

    func test_unpadding_removesEveryTrailingJsonBlank() {
        XCTAssertEqual(E2EEPadding.unpadded(Data("{\"v\":2}   \r\n\t ".utf8)), Data("{\"v\":2}".utf8))
        XCTAssertEqual(E2EEPadding.unpadded(Data("{\"text\":\"a \"}".utf8)), Data("{\"text\":\"a \"}".utf8))
    }
}
