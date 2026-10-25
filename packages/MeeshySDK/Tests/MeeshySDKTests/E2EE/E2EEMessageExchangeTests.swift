import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// L'envoi et la réception par appareil (spec § 3.4, § 3.5, § 4.1 à 4.4), de
/// bout en bout entre installations réelles (stores persistants, libsignal) et
/// une passerelle qui applique Sesame. Modèle de menace : serveur compromis en
/// lecture (il ne voit que des chiffrés) et actif (il réattribue, rejoue,
/// ajoute un appareil sur mon compte).
final class E2EEMessageExchangeTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let conversation = "conv1"

    private func send(
        _ content: E2EEContent, from sender: E2EETestPeer, to peer: String, on server: FakeE2EEServer, messageId: String = "m1"
    ) async throws -> E2EESealedMessage {
        let sealed = try await sender.sealer.seal(content, to: peer)
        try server.relay(sealed, from: sender.userId, conversationId: conversation, participants: [sender.userId, peer], messageId: messageId)
        return sealed
    }

    func test_eachOfBobsDevices_opensItsOwnEnvelope_andNoPlaintextReachesTheWire() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let bobMac = try await E2EETestPeer.enroll(bob, on: server)
        let sentinel = "sentinelle-\(UUID().uuidString)"

        let sealed = try await send(aliceIPhone.content(sentinel), from: aliceIPhone, to: bob, on: server)

        XCTAssertEqual(Set(sealed.envelopes.map(\.deviceId)), [bobIPhone.device.deviceId, bobMac.device.deviceId])
        XCTAssertEqual(sealed.envelopes.map(\.type), [E2EECiphertext.preKeyType, E2EECiphertext.preKeyType])
        for receiver in [bobIPhone, bobMac] {
            let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: receiver.device.deviceId).first)
            guard case .opened(let message) = receiver.opener.open(envelope) else { return XCTFail("enveloppe illisible") }
            XCTAssertEqual(message.content.text, sentinel)
            XCTAssertEqual(message.senderUserId, alice)
            XCTAssertEqual(try receiver.plaintexts.entry(for: "m1"), .readable(message.content, senderUserId: alice))
        }
        let wire = server.wire.reduce(Data(), +)
        XCTAssertNil(wire.range(of: Data(sentinel.utf8)), "aucun octet clair sur le fil")
    }

    func test_myUnapprovedOtherDevice_receivesNothing_andIsDeclaredUnapproved() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)

        let sealed = try await send(aliceIPhone.content("salut"), from: aliceIPhone, to: bob, on: server)

        XCTAssertEqual(sealed.envelopes.map(\.userId), [bob])
        XCTAssertEqual(sealed.unapprovedOwnDevices, [aliceMac.device.deviceId])
        XCTAssertTrue(server.pending(userId: alice, deviceId: aliceMac.device.deviceId).isEmpty)
    }

    func test_myApprovedOtherDevice_receivesItsCopy() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try aliceIPhone.approve(aliceMac)

        let sealed = try await send(aliceIPhone.content("copie"), from: aliceIPhone, to: bob, on: server)

        XCTAssertEqual(sealed.unapprovedOwnDevices, [])
        try aliceMac.approve(aliceIPhone)
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: aliceMac.device.deviceId).first)
        guard case .opened(let message) = aliceMac.opener.open(copy) else { return XCTFail("copie illisible") }
        XCTAssertEqual(message.content.text, "copie")
    }

    func test_aMessageFromMyOwnUnapprovedDevice_isNotOpened() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try aliceIPhone.approve(aliceMac)
        _ = try await send(aliceIPhone.content("me faire dire"), from: aliceIPhone, to: bob, on: server)
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: aliceMac.device.deviceId).first)

        XCTAssertEqual(aliceMac.opener.open(copy), .deferred(envelopeId: copy.id),
                       "un appareil de mon compte que je n'ai pas approuvé ne me fait rien dire, et son enveloppe attend l'approbation (#12976)")
        XCTAssertNil(try aliceMac.plaintexts.entry(for: "m1"), "rien n'est rangé, pas même « illisible »")
    }

    func test_anApprovalPinnedToAnotherIdentity_isNotHonoured() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try aliceIPhone.approvals.approve(deviceId: aliceMac.device.deviceId, identityKey: Data(repeating: 7, count: 33))

        let sealed = try await send(aliceIPhone.content("non"), from: aliceIPhone, to: bob, on: server)

        XCTAssertEqual(sealed.unapprovedOwnDevices, [aliceMac.device.deviceId], "le serveur ne substitue pas un de mes appareils")
        XCTAssertFalse(sealed.envelopes.contains { $0.userId == alice })
    }

    func test_aPeerWithoutAnyDevice_isRefusedBeforeAnythingLeaves() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)

        do {
            _ = try await aliceIPhone.sealer.seal(aliceIPhone.content("perdu"), to: bob)
            XCTFail("un correspondant sans appareil ne reçoit rien")
        } catch {
            XCTAssertEqual(error as? E2EESealError, .recipientHasNoDevice(userId: bob))
        }
    }

    func test_theSecondMessage_isAWhisperMessage_andTheReplyOpensOnTheOtherSide() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send(aliceIPhone.content("un"), from: aliceIPhone, to: bob, on: server, messageId: "m1")
        _ = bobIPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first))

        let reply = try await send(bobIPhone.content("deux"), from: bobIPhone, to: alice, on: server, messageId: "m2")
        let toAlice = try XCTUnwrap(server.pending(userId: alice, deviceId: aliceIPhone.device.deviceId).first)
        guard case .opened(let opened) = aliceIPhone.opener.open(toAlice) else { return XCTFail("réponse illisible") }
        let third = try await send(aliceIPhone.content("trois"), from: aliceIPhone, to: bob, on: server, messageId: "m3")

        XCTAssertEqual(reply.envelopes.first?.type, E2EECiphertext.whisperType)
        XCTAssertEqual(opened.content.text, "deux")
        XCTAssertEqual(third.envelopes.first?.type, E2EECiphertext.whisperType, "la réponse reçue clôt l'accord PQXDH")
    }

    func test_aReinstalledPeerDevice_getsAFreshSessionWithoutA409() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let oldBob = try await E2EETestPeer.enroll(bob, on: server, session: "bob-old")
        _ = try await send(aliceIPhone.content("avant"), from: aliceIPhone, to: bob, on: server, messageId: "m1")
        server.revoke(userId: bob, deviceId: oldBob.device.deviceId)
        let newBob = try await E2EETestPeer.enroll(bob, on: server, session: "bob-new")

        let sealed = try await send(aliceIPhone.content("après"), from: aliceIPhone, to: bob, on: server, messageId: "m2")

        XCTAssertEqual(sealed.envelopes.map(\.registrationId), [newBob.device.registrationId])
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: newBob.device.deviceId).last)
        guard case .opened(let message) = newBob.opener.open(envelope) else { return XCTFail("la nouvelle installation lit") }
        XCTAssertEqual(message.content.text, "après")
    }

    func test_a409StaleDropsTheSessionAndResealsOnce() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send(aliceIPhone.content("un"), from: aliceIPhone, to: bob, on: server, messageId: "m1")
        let attempts = E2EECallCounter()
        let stale = E2EEDevicesMismatch(stale: [E2EEDeviceRef(userId: bob, deviceId: bobIPhone.device.deviceId)])

        let delivered = try await aliceIPhone.sealer.sealAndDeliver(aliceIPhone.content("deux"), to: bob) { sealed in
            if attempts.increment() == 1 { throw stale }
            return sealed
        }

        XCTAssertEqual(attempts.value, 2)
        XCTAssertEqual(delivered.envelopes.first?.type, E2EECiphertext.preKeyType, "la session périmée est rouverte depuis un bundle")
    }

    func test_aServerThatRefusesForever_stopsAfterThreeAttempts() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        let attempts = E2EECallCounter()
        let ghost = E2EEDevicesMismatch(missing: [E2EEDeviceRef(userId: bob, deviceId: 9)])

        do {
            _ = try await aliceIPhone.sealer.sealAndDeliver(aliceIPhone.content("boucle"), to: bob) { _ -> Int in
                attempts.increment()
                throw ghost
            }
            XCTFail("la boucle s'arrête")
        } catch {
            XCTAssertEqual(error as? E2EESealError, .devicesMismatchUnresolved)
            XCTAssertEqual(attempts.value, E2EEMessageSealer.maxAttempts)
        }
    }

    func test_anEnvelopeOpenedTwice_keepsItsPlaintext() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send(aliceIPhone.content("une fois"), from: aliceIPhone, to: bob, on: server)
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)

        let first = bobIPhone.opener.open(envelope)
        let second = bobIPhone.opener.open(envelope)

        XCTAssertEqual(first, second)
        guard case .opened = second else { return XCTFail("la socket et le rattrapage se croisent sans rien perdre") }
    }

    func test_theSocketAndTheCatchUpOpeningTheSameEnvelopeAtOnce_neverMarkItUndecryptable() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send(aliceIPhone.content("course"), from: aliceIPhone, to: bob, on: server)
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        let opener = bobIPhone.opener

        let outcomes = await withTaskGroup(of: E2EEOpenOutcome.self) { group in
            (0..<4).forEach { _ in group.addTask { opener.open(envelope) } }
            return await group.reduce(into: [E2EEOpenOutcome]()) { $0.append($1) }
        }

        XCTAssertTrue(outcomes.allSatisfy { if case .opened = $0 { true } else { false } }, "\(outcomes)")
        guard case .readable? = try bobIPhone.plaintexts.entry(for: "m1") else { return XCTFail("le clair reste") }
    }

    func test_aStorageRefusal_defersTheEnvelope_neverAcknowledgesIt_andItOpensLater() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send(aliceIPhone.content("plus tard"), from: aliceIPhone, to: bob, on: server)
        let lockless = E2EESessionCipher(
            local: bobIPhone.device.address, store: MeeshySignalProtocolStore(identity: bobIPhone.enrolled.identity),
            vault: bobIPhone.vault, lock: E2EEProcessLock(path: "/nonexistent-\(UUID().uuidString)/e2ee.lock")
        )
        let suspended = E2EEEnvelopeOpener(
            local: bobIPhone.device, cipher: lockless, plaintexts: bobIPhone.plaintexts,
            directory: bobIPhone.directory, approvals: bobIPhone.approvals
        )

        let outcomes = try await suspended.catchUp()

        XCTAssertEqual(outcomes.count, 1)
        guard case .deferred = outcomes.first else { return XCTFail("un refus de stockage n'est pas un verdict : \(outcomes)") }
        XCTAssertNil(try bobIPhone.plaintexts.entry(for: "m1"))
        XCTAssertEqual(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).count, 1, "l'enveloppe reste sur le serveur")
        let later = try await bobIPhone.opener.catchUp()
        guard case .opened(let message) = later.first else { return XCTFail("elle s'ouvre au rattrapage suivant") }
        XCTAssertEqual(message.content.text, "plus tard")
    }

    func test_anEnvelopeOfAnotherGeneration_isSetAside() async throws {
        let server = FakeE2EEServer()
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let foreign = E2EEServedEnvelope(
            id: "e9", messageId: "m9", conversationId: conversation, recipientRegistrationId: bobIPhone.device.registrationId ^ 1,
            senderUserId: alice, senderDeviceId: 1, type: 3, body: "AAAA", createdAt: "t"
        )

        XCTAssertEqual(bobIPhone.opener.open(foreign), .notForThisDevice(envelopeId: "e9"))
        XCTAssertNil(try bobIPhone.plaintexts.entry(for: "m9"))
    }

    func test_aServerThatMovesAMessageToAnotherConversation_getsNothingReadable_andTheRatchetDoesNotMove() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send(aliceIPhone.content("à sa place"), from: aliceIPhone, to: bob, on: server)
        let honest = try XCTUnwrap(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).first)
        let moved = E2EEServedEnvelope(
            id: honest.id, messageId: "m-other", conversationId: "conv-other", recipientRegistrationId: honest.recipientRegistrationId,
            senderUserId: honest.senderUserId, senderDeviceId: honest.senderDeviceId, type: honest.type, body: honest.body, createdAt: honest.createdAt
        )

        XCTAssertEqual(bobIPhone.opener.open(moved), .undecryptable(messageId: "m-other", conversationId: "conv-other"))
        guard case .opened(let message) = bobIPhone.opener.open(honest) else { return XCTFail("le vrai message s'ouvre encore") }
        XCTAssertEqual(message.content.text, "à sa place")
    }

    func test_catchUp_opensEveryPendingEnvelope_thenAcknowledgesThem() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        for index in 1...3 {
            _ = try await send(aliceIPhone.content("m\(index)", clientMessageId: "cid_\(index)"), from: aliceIPhone, to: bob, on: server, messageId: "m\(index)")
        }

        let outcomes = try await bobIPhone.opener.catchUp()

        XCTAssertEqual(outcomes.compactMap(\.messageId), ["m1", "m2", "m3"])
        XCTAssertTrue(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).isEmpty, "acquittées, donc effacées")
        XCTAssertEqual(try bobIPhone.plaintexts.entries(for: ["m1", "m2", "m3"]).count, 3)
    }

    func test_theDecryptedPlaintext_isSealedOnDisk() async throws {
        let server = FakeE2EEServer()
        let path = E2EETestDevice.temporaryPath("sqlite")
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server, databasePath: path)
        let sentinel = "disque-\(UUID().uuidString)"
        _ = try await send(aliceIPhone.content(sentinel), from: aliceIPhone, to: bob, on: server)

        _ = try await bobIPhone.opener.catchUp()

        let file = try Data(contentsOf: URL(fileURLWithPath: path))
        XCTAssertNil(file.range(of: Data(sentinel.utf8)), "le clair rangé sur l'appareil est scellé")
        guard case .readable(let content, _)? = try bobIPhone.plaintexts.entry(for: "m1") else { return XCTFail("clair rangé") }
        XCTAssertEqual(content.text, sentinel)
    }
}

final class E2EECallCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    @discardableResult
    func increment() -> Int { lock.withLock { count += 1; return count } }

    var value: Int { lock.withLock { count } }
}
