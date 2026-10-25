import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// Le pointeur d'une pièce jointe voyage DANS le chiffré libsignal (#10789),
/// entre installations réelles sur la fausse passerelle : la clé, le nom et le
/// type n'atteignent jamais le fil. Et un contenu d'une version que cet appareil
/// ne lit pas encore n'est pas perdu : son clair est gardé pour la mise à jour
/// qui saura le lire (#9223 — rien ne se perd en silence).
final class E2EEAttachmentContentExchangeTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let conversation = "conv1"

    private func relay(_ sealed: E2EESealedMessage, from sender: E2EETestPeer, on server: FakeE2EEServer, messageId: String) throws {
        try server.relay(sealed, from: sender.userId, conversationId: conversation, participants: [alice, bob], messageId: messageId)
    }

    func test_aPointerTravelsInsideTheCiphertext_andOpensIntact() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let fileName = "contrat-\(UUID().uuidString).pdf"
        let sealedFile = try E2EEAttachmentCipher.seal(Data("%PDF-1.7 secret".utf8))
        let pointer = E2EEAttachmentPointer(
            id: "6add00000000000000000a01", key: sealedFile.secret.key, digest: sealedFile.secret.digest,
            size: sealedFile.secret.size, contentType: "application/pdf", fileName: fileName, kind: .file
        )
        let content = E2EEContent(
            text: nil, language: nil, replyTo: nil, conversationId: conversation, clientMessageId: "cid_1",
            sentAt: Date(), attachments: [pointer]
        )

        try relay(try await aliceIPhone.sealer.seal(content, to: bob), from: aliceIPhone, on: server, messageId: "m1")

        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        guard case .opened(let message) = bobIPhone.opener.open(envelope) else { return XCTFail("enveloppe illisible") }
        let opened = try XCTUnwrap(message.content.attachments?.first)
        XCTAssertEqual(opened, pointer)
        XCTAssertEqual(try E2EEAttachmentCipher.open(sealedFile.blob, with: opened.secret), Data("%PDF-1.7 secret".utf8))
        let wire = server.wire.reduce(Data(), +)
        XCTAssertNil(wire.range(of: Data(fileName.utf8)), "le nom de fichier n'atteint pas le fil")
        XCTAssertNil(wire.range(of: Data("application/pdf".utf8)), "le type n'atteint pas le fil")
        XCTAssertNil(wire.range(of: sealedFile.secret.key), "la clé n'atteint pas le fil")
        XCTAssertNil(wire.range(of: Data(sealedFile.secret.key.base64EncodedString().utf8)), "la clé n'atteint pas le fil, même en base64")
    }

    /// Un contenu v3 (version future) : l'appareil ne l'affiche pas à moitié, il
    /// le GARDE tel quel, sous l'auteur que libsignal a authentifié.
    func test_aNewerContentVersion_isKeptRaw_forTheUpdateThatWillReadIt() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try relay(try await aliceIPhone.sealer.seal(aliceIPhone.content("bonjour"), to: bob), from: aliceIPhone, on: server, messageId: "m1")
        let first = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        _ = bobIPhone.opener.open(first)
        let raw = Data(#"{"authorDeviceId":\#(aliceIPhone.device.deviceId),"authorUserId":"\#(alice)","conversationId":"conv1","hologram":{},"sentAt":1,"v":3}"#.utf8)

        try relay(sealedRaw(raw, from: aliceIPhone, to: bobIPhone), from: aliceIPhone, on: server, messageId: "m2")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first { $0.messageId == "m2" })

        XCTAssertEqual(bobIPhone.opener.open(envelope), .undecryptable(messageId: "m2", conversationId: conversation))
        XCTAssertEqual(try bobIPhone.plaintexts.entry(for: "m2"), .newerFormat(raw, senderUserId: alice))
    }

    /// Une version future qui change la FORME d'un champ connu (ici `sentAt`)
    /// n'est pas jugée illisible pour autant : seule sa version compte (audit du 2026-10-25).
    func test_aNewerContentVersionWithAReshapedField_isStillKeptRaw() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try relay(try await aliceIPhone.sealer.seal(aliceIPhone.content("bonjour"), to: bob), from: aliceIPhone, on: server, messageId: "m1")
        _ = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))
        let raw = Data(#"{"authorDeviceId":\#(aliceIPhone.device.deviceId),"authorUserId":"\#(alice)","conversationId":"conv1","sentAt":"later","v":3}"#.utf8)

        try relay(sealedRaw(raw, from: aliceIPhone, to: bobIPhone), from: aliceIPhone, on: server, messageId: "m2")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first { $0.messageId == "m2" })

        _ = bobIPhone.opener.open(envelope)
        XCTAssertEqual(try bobIPhone.plaintexts.entry(for: "m2"), .newerFormat(raw, senderUserId: alice))
    }

    /// Le serveur range un contenu futur dans une AUTRE conversation : il n'est
    /// pas gardé comme lisible plus tard, il est jugé illisible.
    func test_aNewerContentForAnotherConversation_isNotKept() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        try relay(try await aliceIPhone.sealer.seal(aliceIPhone.content("bonjour"), to: bob), from: aliceIPhone, on: server, messageId: "m1")
        _ = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))
        let raw = Data(#"{"authorDeviceId":\#(aliceIPhone.device.deviceId),"authorUserId":"\#(alice)","conversationId":"elsewhere","sentAt":1,"v":3}"#.utf8)

        try relay(sealedRaw(raw, from: aliceIPhone, to: bobIPhone), from: aliceIPhone, on: server, messageId: "m2")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first { $0.messageId == "m2" })

        XCTAssertEqual(bobIPhone.opener.open(envelope), .undecryptable(messageId: "m2", conversationId: conversation))
        XCTAssertEqual(try bobIPhone.plaintexts.entry(for: "m2"), .undecryptable)
    }

    /// Un clair arbitraire, chiffré par la session déjà ouverte d'Alice vers Bob.
    private func sealedRaw(_ raw: Data, from sender: E2EETestPeer, to receiver: E2EETestPeer) throws -> E2EESealedMessage {
        let ciphertext = try sender.cipher.encrypt(raw, for: receiver.device.address)
        return E2EESealedMessage(
            senderDeviceId: sender.device.deviceId,
            envelopes: [E2EEOutgoingEnvelope(
                userId: receiver.userId, deviceId: receiver.device.deviceId, registrationId: receiver.device.registrationId,
                type: ciphertext.type, body: ciphertext.body.base64EncodedString()
            )],
            unapprovedOwnDevices: []
        )
    }
}
