import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// Les signaux de bout en bout entre installations réelles (libsignal, stores
/// scellés) et une passerelle qui applique Sesame (#13142). Modèle de menace :
/// serveur compromis — il ne voit que des chiffrés de même taille, et il ne
/// peut ni attribuer un signal à un autre auteur, ni le ranger ailleurs.
final class E2EESignalExchangeTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let conversation = "conv1"

    private func signal(_ action: E2EESignalAction, in conversationId: String = "conv1") -> E2EESignal {
        E2EESignal(conversationId: conversationId, sentAt: Date(), action: action)
    }

    private func relay(
        _ sealed: E2EESealedMessage, from sender: E2EETestPeer, to peer: String, on server: FakeE2EEServer,
        id: String, conversationId: String = "conv1"
    ) throws {
        try server.relay(sealed, from: sender.userId, conversationId: conversationId, participants: [sender.userId, peer], messageId: id)
    }

    func test_aReactionReachesEachOfBobsDevices_authenticated_andNothingClearReachesTheWire() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let bobMac = try await E2EETestPeer.enroll(bob, on: server)
        let emoji = "🫥"

        let sealed = try await aliceIPhone.sealer.seal(signal(.reaction(target: "m1", emoji: emoji, removed: false)), to: bob)
        try relay(sealed, from: aliceIPhone, to: bob, on: server, id: "s1")

        for receiver in [bobIPhone, bobMac] {
            let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: receiver.device.deviceId).first)
            guard case .signal(let received) = receiver.opener.open(envelope) else { return XCTFail("signal illisible") }
            XCTAssertEqual(received.signal.action, .reaction(target: "m1", emoji: emoji, removed: false))
            XCTAssertEqual(received.senderUserId, alice)
            XCTAssertEqual(received.senderDeviceId, aliceIPhone.device.deviceId)
            XCTAssertEqual(try receiver.signals.pending().map(\.signalId), ["s1"], "rangé avec son déchiffrement")
            XCTAssertNil(try receiver.plaintexts.entry(for: "s1"), "un signal n'est pas un message")
        }
        let wire = server.wire.reduce(Data(), +)
        XCTAssertNil(wire.range(of: Data(emoji.utf8)))
        XCTAssertNil(wire.range(of: Data("reaction".utf8)))
    }

    func test_aReactionAndAShortMessage_leaveEnvelopesOfTheSameSize() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await aliceIPhone.sealer.seal(aliceIPhone.content("amorce"), to: bob)

        let message = try await aliceIPhone.sealer.seal(aliceIPhone.content("ok"), to: bob)
        let reaction = try await aliceIPhone.sealer.seal(signal(.reaction(target: String(repeating: "f", count: 24), emoji: "👍", removed: false)), to: bob)
        let typing = try await aliceIPhone.sealer.seal(signal(.typing(active: true)), to: bob)

        let sizes = Set([message, reaction, typing].compactMap { $0.envelopes.first?.body.count })
        XCTAssertEqual(sizes.count, 1, "la passerelle ne distingue pas un message court d'une réaction ni de la frappe par la taille")
    }

    func test_theSameEnvelopeOpenedTwice_returnsTheSameSignal_withoutAnUndecryptableMark() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let sealed = try await aliceIPhone.sealer.seal(signal(.deleteForEveryone(target: "m1")), to: bob)
        try relay(sealed, from: aliceIPhone, to: bob, on: server, id: "s1")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)

        let first = bobIPhone.opener.open(envelope)
        let second = bobIPhone.opener.open(envelope)

        XCTAssertEqual(first, second, "la socket et le rattrapage qui se croisent rendent le même signal")
        XCTAssertNil(try bobIPhone.plaintexts.entry(for: "s1"))
    }

    func test_aSignalThatTheServerFilesInAnotherConversation_isNeverReceived() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let sealed = try await aliceIPhone.sealer.seal(signal(.deleteForEveryone(target: "m1"), in: "conv1"), to: bob)
        try relay(sealed, from: aliceIPhone, to: bob, on: server, id: "s1", conversationId: "conv-autre")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)

        XCTAssertEqual(bobIPhone.opener.open(envelope), .undecryptable(messageId: "s1", conversationId: "conv-autre"))
        XCTAssertEqual(try bobIPhone.signals.pending(), [])
    }

    func test_aSignalFromMyUnapprovedOtherDevice_waits_unopened() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try aliceIPhone.approve(aliceMac)
        let sealed = try await aliceIPhone.sealer.seal(signal(.viewOnceOpened(target: "m1")), to: bob)
        try relay(sealed, from: aliceIPhone, to: bob, on: server, id: "s1")
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: aliceMac.device.deviceId).first)

        XCTAssertEqual(aliceMac.opener.open(copy), .deferred(envelopeId: copy.id))
        XCTAssertEqual(try aliceMac.signals.pending(), [])
    }

    func test_aSettledSignalIsNotPendingAnymore_butStaysKnownAgainstACrossedCopy() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let sealed = try await aliceIPhone.sealer.seal(signal(.typing(active: true)), to: bob)
        try relay(sealed, from: aliceIPhone, to: bob, on: server, id: "s1")
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        _ = bobIPhone.opener.open(envelope)

        try bobIPhone.signals.settle(["s1"], at: Date())

        XCTAssertEqual(try bobIPhone.signals.pending(), [])
        guard case .signal(let crossed) = bobIPhone.opener.open(envelope) else { return XCTFail("copie croisée jugée illisible") }
        XCTAssertNotNil(crossed.settledAt, "réglé, il ne se rejoue pas")
    }

    func test_aSettledSignalIsForgottenAfterTheRetention() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let sealed = try await aliceIPhone.sealer.seal(signal(.typing(active: false)), to: bob)
        try relay(sealed, from: aliceIPhone, to: bob, on: server, id: "s1")
        _ = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))
        try bobIPhone.signals.settle(["s1"], at: Date(timeIntervalSinceNow: -E2EESignalInbox.settledRetention - 60))

        try bobIPhone.signals.settle([], at: Date())

        XCTAssertNil(try bobIPhone.signals.entry(for: "s1"))
    }
}
