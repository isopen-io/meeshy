import Foundation
import LibSignalClient
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// L'approbation de mes propres appareils (spec § 3.5, #12976) : sans elle, mes
/// messages chiffrés n'atteignent jamais mon autre appareil. Modèle de menace :
/// serveur compromis qui ajoute un appareil à mon compte, substitue la clé
/// d'identité d'un de mes appareils dans l'annuaire, ou reprend une place.
final class E2EEOwnDeviceLinkingTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    private func linking(of peer: E2EETestPeer, directory: (any E2EEDirectoryClientProviding)? = nil) -> E2EEOwnDeviceLinking {
        E2EEOwnDeviceLinking(local: peer.enrolled, cipher: peer.cipher, directory: directory ?? peer.directory, approvals: peer.approvals)
    }

    private func send(
        _ text: String, from sender: E2EETestPeer, to peer: String, on server: FakeE2EEServer, messageId: String = "m1"
    ) async throws -> E2EESealedMessage {
        let sealed = try await sender.sealer.seal(sender.content(text), to: peer)
        try server.relay(sealed, from: sender.userId, conversationId: "conv1", participants: [sender.userId, peer], messageId: messageId)
        return sealed
    }

    /// A lit le QR que B lui montre, puis confirme.
    private func approve(_ approved: E2EETestPeer, by approver: E2EETestPeer) async throws {
        let code = try await linking(of: approved).pairingCode(towards: approver.device.deviceId)
        let candidate = try await linking(of: approver).candidate(matching: code.qrPayload)
        try linking(of: approver).approve(try XCTUnwrap(candidate))
    }

    // MARK: - Vecteurs officiels (libsignal, PublicAPITests.testFingerprint, version 2)

    func test_fingerprint_matchesTheOfficialLibsignalVectors() throws {
        let aliceKey = try PublicKey([
            0x05, 0x06, 0x86, 0x3B, 0xC6, 0x6D, 0x02, 0xB4, 0x0D, 0x27, 0xB8, 0xD4, 0x9C, 0xA7, 0xC0, 0x9E, 0x92, 0x39,
            0x23, 0x6F, 0x9D, 0x7D, 0x25, 0xD6, 0xFC, 0xCA, 0x5C, 0xE1, 0x3C, 0x70, 0x64, 0xD8, 0x68,
        ] as [UInt8])
        let bobKey = try PublicKey([
            0x05, 0xF7, 0x81, 0xB6, 0xFB, 0x32, 0xFE, 0xD9, 0xBA, 0x1C, 0xF2, 0xDE, 0x97, 0x8D, 0x4D, 0x5D, 0xA2, 0x8D,
            0xC3, 0x40, 0x46, 0xAE, 0x81, 0x44, 0x02, 0xB5, 0xC0, 0xDB, 0xD9, 0x6F, 0xDA, 0x90, 0x7B,
        ] as [UInt8])
        let aliceScannableV2 = Data([
            0x08, 0x02, 0x12, 0x22, 0x0A, 0x20, 0x1E, 0x30, 0x1A, 0x03, 0x53, 0xDC, 0xE3, 0xDB, 0xE7, 0x68, 0x4C, 0xB8,
            0x33, 0x6E, 0x85, 0x13, 0x6C, 0xDC, 0x0E, 0xE9, 0x62, 0x19, 0x49, 0x4A, 0xDA, 0x30, 0x5D, 0x62, 0xA7, 0xBD,
            0x61, 0xDF, 0x1A, 0x22, 0x0A, 0x20, 0xD6, 0x2C, 0xBF, 0x73, 0xA1, 0x15, 0x92, 0x01, 0x5B, 0x6B, 0x9F, 0x16,
            0x82, 0xAC, 0x30, 0x6F, 0xEA, 0x3A, 0xAF, 0x38, 0x85, 0xB8, 0x4D, 0x12, 0xBC, 0xA6, 0x31, 0xE9, 0xD4, 0xFB,
            0x3A, 0x4D,
        ])

        let fingerprint = try E2EEFingerprint.between(
            local: (Data("+14152222222".utf8), aliceKey),
            remote: (Data("+14153333333".utf8), bobKey)
        )

        XCTAssertEqual(fingerprint.displayable.formatted, "300354477692869396892869876765458257569162576843440918079131")
        XCTAssertEqual(fingerprint.scannable.encoding, aliceScannableV2)
    }

    // MARK: - Ce que deux plateformes doivent écrire à l'identique

    func test_ownDeviceIdentifier_isDomainSeparated_lowercased_andDecimal() {
        XCTAssertEqual(E2EEFingerprint.ownDeviceIdentifier(userId: "6ADA27BF", deviceId: 3), Data("meeshy-own-device:v1:6ada27bf.3".utf8))
    }

    func test_pairingPayload_isText_roundTrips_andRejectsAnythingElse() {
        let bytes = Data((0...255).map(UInt8.init))
        let text = E2EEPairingPayload.encode(bytes)

        XCTAssertTrue(text.hasPrefix("meeshy-device-link:v1:"))
        XCTAssertFalse(text.contains("+") || text.contains("/") || text.contains("="))
        XCTAssertEqual(E2EEPairingPayload.decode(text), bytes)
        XCTAssertNil(E2EEPairingPayload.decode("https://meeshy.me/world"))
        XCTAssertNil(E2EEPairingPayload.decode("meeshy-device-link:v2:AAAA"))
    }

    // MARK: - Approbation

    func test_myTwoDevices_showTheSameSixtyDigits_andDifferentCodes() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)

        let onIPhone = try await linking(of: iPhone).pairingCode(towards: mac.device.deviceId)
        let onMac = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)

        XCTAssertEqual(onIPhone.displayable, onMac.displayable)
        XCTAssertEqual(onIPhone.displayable.count, 60)
        XCTAssertNotEqual(onIPhone.qrPayload, onMac.qrPayload)
    }

    func test_approvingBothWays_myMessageReachesMyOtherDevice_andNoPlaintextReachesTheWire() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        let sentinel = "sentinelle-\(UUID().uuidString)"

        try await approve(mac, by: iPhone)
        try await approve(iPhone, by: mac)
        let sealed = try await send(sentinel, from: iPhone, to: bob, on: server)

        XCTAssertEqual(sealed.unapprovedOwnDevices, [])
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: mac.device.deviceId).first)
        guard case .opened(let message) = mac.opener.open(copy) else { return XCTFail("ma copie reste illisible") }
        XCTAssertEqual(message.content.text, sentinel)
        XCTAssertNil(server.wire.reduce(Data(), +).range(of: Data(sentinel.utf8)), "aucun octet clair sur le fil")
    }

    func test_aCopySentBeforeTheSecondApproval_waits_thenOpens() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        _ = try await send("entre les deux", from: iPhone, to: bob, on: server)
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: mac.device.deviceId).first)

        let before = mac.opener.open(copy)
        try await approve(iPhone, by: mac)
        let after = mac.opener.open(copy)

        XCTAssertEqual(before, .deferred(envelopeId: copy.id), "ni ouverte ni perdue : elle attend")
        guard case .opened(let message) = after else { return XCTFail("la copie ne s'ouvre pas après l'approbation") }
        XCTAssertEqual(message.content.text, "entre les deux")
    }

    func test_aMatchingCode_pinsNothingUntilConfirmed() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)

        let code = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        let candidate = try await linking(of: iPhone).candidate(matching: code.qrPayload)

        XCTAssertEqual(candidate?.deviceId, mac.device.deviceId)
        XCTAssertEqual(candidate?.identityKey, mac.identityKey)
        XCTAssertNil(try iPhone.approvals.approvedIdentity(of: mac.device.deviceId))
    }

    func test_ownDevices_saysWhichIsApproved_andForgetsADeviceNoLongerListed() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        let iPad = try await E2EETestPeer.enroll(alice, on: server)
        try await approve(mac, by: iPhone)
        try await approve(iPad, by: iPhone)

        let listed = try await linking(of: iPhone).ownDevices()
        server.revoke(userId: alice, deviceId: iPad.device.deviceId)
        let afterRetirement = try await linking(of: iPhone).ownDevices()

        XCTAssertEqual(listed.map(\.deviceId), [mac.device.deviceId, iPad.device.deviceId])
        XCTAssertEqual(listed.map(\.approved), [true, true])
        XCTAssertEqual(afterRetirement.map(\.deviceId), [mac.device.deviceId])
        XCTAssertNil(try iPhone.approvals.approvedIdentity(of: iPad.device.deviceId), "un appareil retiré ne garde pas son approbation")
    }

    // MARK: - Serveur compromis

    func test_aKeySubstitutedByTheServer_neverMatches_andNothingIsPinned() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        let mallory = try await E2EETestPeer.enroll(alice, on: FakeE2EEServer())
        let lying = ScriptedDirectory(honest: iPhone.directory) { bundle in
            guard bundle.deviceId == mac.device.deviceId else { return bundle }
            return E2EEDeviceBundle(
                deviceId: bundle.deviceId, registrationId: bundle.registrationId, identityKey: mallory.identityKey.base64EncodedString(),
                signedPreKey: bundle.signedPreKey, kyberPreKey: bundle.kyberPreKey, preKey: bundle.preKey
            )
        }

        let macCode = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        let candidate = try await linking(of: iPhone, directory: lying).candidate(matching: macCode.qrPayload)
        let sealed = try await send("non", from: iPhone, to: bob, on: server)

        XCTAssertNil(candidate)
        XCTAssertNil(try iPhone.approvals.approvedIdentity(of: mac.device.deviceId))
        XCTAssertFalse(sealed.envelopes.contains { $0.userId == alice })
    }

    func test_theStoreRefusesASessionToMyDeviceUnderAKeyIDidNotPin() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        try iPhone.approvals.approve(deviceId: mac.device.deviceId, identityKey: Data(repeating: 7, count: 33))
        let served = try await iPhone.directory.bundles(userId: alice, deviceIds: [mac.device.deviceId])
        let bundle = try XCTUnwrap(served.devices.first)

        XCTAssertThrowsError(try iPhone.cipher.startSession(with: bundle, of: alice), "libsignal refuse, dans sa transaction, une clé non épinglée")
        XCTAssertFalse(try iPhone.cipher.hasSession(with: mac.device.address))
    }

    func test_aContactsCode_orGarbage_matchesNothing() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let bobMac = try await E2EETestPeer.enroll(bob, on: server)
        let bobsOwnCode = try await linking(of: bobIPhone).pairingCode(towards: bobMac.device.deviceId)

        let fromContact = try await linking(of: iPhone).candidate(matching: bobsOwnCode.qrPayload)
        let fromGarbage = try await linking(of: iPhone).candidate(matching: "meeshy-device-link:v1:cGFzIHVuIGNvZGU")

        XCTAssertNil(fromContact)
        XCTAssertNil(fromGarbage)
    }

    func test_aPhantomDeviceWithoutBundle_doesNotHideMyRealDevice() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let phantom = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        let silent = ScriptedDirectory(honest: iPhone.directory, drops: phantom.device.deviceId) { $0 }

        let code = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        let candidate = try await linking(of: iPhone, directory: silent).candidate(matching: code.qrPayload)

        XCTAssertEqual(candidate?.deviceId, mac.device.deviceId)
    }

    func test_aReinstalledDeviceOnTheSameSlot_isNoLongerApproved_andCanBeApprovedAgain() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        _ = try await send("avant", from: iPhone, to: bob, on: server)
        server.revoke(userId: alice, deviceId: mac.device.deviceId)
        let reinstalled = try await E2EETestPeer.enroll(alice, on: server)
        XCTAssertEqual(reinstalled.device.deviceId, mac.device.deviceId)

        let status = try await linking(of: iPhone).ownDevices()
        try await approve(reinstalled, by: iPhone)
        let sealed = try await send("après", from: iPhone, to: bob, on: server, messageId: "m2")

        XCTAssertEqual(status.map(\.approved), [false], "une place reprise n'hérite pas de l'approbation")
        XCTAssertTrue(sealed.envelopes.contains { $0.userId == alice && $0.registrationId == reinstalled.device.registrationId })
    }

    func test_showingMyCode_keepsAnExistingSession_withItsRatchet() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        _ = try await send("un", from: iPhone, to: bob, on: server)
        let sessionKey = "\(alice).\(mac.device.deviceId)"
        let before = try iPhone.vault.read { try $0.load(.session, sessionKey) }

        _ = try await linking(of: iPhone).pairingCode(towards: mac.device.deviceId)
        let after = try iPhone.vault.read { try $0.load(.session, sessionKey) }

        XCTAssertNotNil(before)
        XCTAssertEqual(after, before, "afficher mon code ne touche ni la session ni son ratchet")
    }

    func test_myOwnCopy_relabelledAsMyContact_neverOpensAsHisWords() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        let bobPhone = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        try await approve(iPhone, by: mac)
        _ = try await send("c'est moi qui l'ai écrit", from: iPhone, to: bob, on: server)
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: mac.device.deviceId).first)
        let relabelled = E2EEServedEnvelope(
            id: copy.id, messageId: copy.messageId, conversationId: copy.conversationId,
            recipientRegistrationId: copy.recipientRegistrationId, senderUserId: bob, senderDeviceId: bobPhone.device.deviceId,
            type: copy.type, body: copy.body, createdAt: copy.createdAt
        )

        let outcome = mac.opener.open(relabelled)

        if case .opened = outcome { XCTFail("le serveur fait dire à Bob ce que j'ai écrit") }
        XCTAssertFalse(try mac.cipher.hasSession(with: E2EEDeviceAddress(userId: bob, deviceId: bobPhone.device.deviceId)),
                       "la transaction est annulée : aucune session de Bob liée à ma clé")
    }

    func test_aCopyUnderAnotherKeyThanMyPin_neverOpens_andWaits() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        _ = try await send("x", from: iPhone, to: bob, on: server)
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: mac.device.deviceId).first)
        try mac.approvals.approve(deviceId: iPhone.device.deviceId, identityKey: Data(repeating: 7, count: 33))

        XCTAssertEqual(mac.opener.open(copy), .deferred(envelopeId: copy.id))
        XCTAssertNil(try mac.plaintexts.entry(for: copy.messageId))
    }

    func test_aReinstalledSlotWithoutPriorSession_isNotShownApproved() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        try await approve(mac, by: iPhone)
        server.revoke(userId: alice, deviceId: mac.device.deviceId)
        _ = try await E2EETestPeer.enroll(alice, on: server)

        let status = try await linking(of: iPhone).ownDevices()

        XCTAssertEqual(status.map(\.approved), [false])
    }

    func test_aCopyFromMyReinstalledDevice_beforeIReapproveIt_waits() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        try await approve(iPhone, by: mac)
        server.revoke(userId: alice, deviceId: mac.device.deviceId)
        let reinstalled = try await E2EETestPeer.enroll(alice, on: server)
        try await approve(iPhone, by: reinstalled)
        _ = try await send("depuis le Mac réinstallé", from: reinstalled, to: bob, on: server)
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: iPhone.device.deviceId).first)

        XCTAssertEqual(iPhone.opener.open(copy), .deferred(envelopeId: copy.id))
    }

    func test_encryptingToMyDeviceUnderARepinnedKey_isRefusedByLibsignal() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        _ = try await send("ouvre la session", from: iPhone, to: bob, on: server)
        try iPhone.approvals.approve(deviceId: mac.device.deviceId, identityKey: Data(repeating: 7, count: 33))

        XCTAssertThrowsError(try iPhone.cipher.encrypt(Data("non".utf8), for: mac.device.address))
    }

    func test_aNetworkErrorOnMyOwnBundles_failsTheSend_insteadOfDroppingMyCopy() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)
        let offline = ScriptedDirectory(honest: iPhone.directory, failsFor: alice) { $0 }
        let sealer = E2EEMessageSealer(local: iPhone.device, cipher: iPhone.cipher, directory: offline, approvals: iPhone.approvals)

        do {
            _ = try await sealer.seal(iPhone.content("hors ligne"), to: bob)
            XCTFail("la copie de mon Mac se perdrait en silence")
        } catch {
            XCTAssertTrue(error is URLError)
        }
    }

    func test_theSealer_signsTheAuthorInsideTheCiphertext() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobPhone = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await send("signé", from: iPhone, to: bob, on: server)
        let envelope = try XCTUnwrap(server.pending(userId: bob, deviceId: bobPhone.device.deviceId).first)

        guard case .opened(let message) = bobPhone.opener.open(envelope) else { return XCTFail("illisible") }
        XCTAssertEqual(message.content.authorUserId, alice)
        XCTAssertEqual(message.content.authorDeviceId, iPhone.device.deviceId)
    }

    func test_aCodeTowardsADeviceThatIsNotMine_isRefused() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)

        do {
            _ = try await linking(of: iPhone).pairingCode(towards: 42)
            XCTFail("un appareil inconnu n'a pas de code")
        } catch {
            XCTAssertEqual(error as? E2EEOwnDeviceLinkingError, .unknownDevice(42))
        }
    }

    func test_revokingAnApproval_stopsTheCopies() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try await approve(mac, by: iPhone)

        try linking(of: iPhone).revoke(deviceId: mac.device.deviceId)
        let sealed = try await send("plus de copie", from: iPhone, to: bob, on: server)

        XCTAssertEqual(sealed.unapprovedOwnDevices, [mac.device.deviceId])
        XCTAssertTrue(server.pending(userId: alice, deviceId: mac.device.deviceId).isEmpty)
    }
}

/// Un annuaire qui ment sur les bundles de mon compte : il les réécrit (`rewrite`)
/// ou en tait un (`drops`), comme le ferait un serveur compromis ou une place fantôme.
private final class ScriptedDirectory: E2EEDirectoryClientProviding, @unchecked Sendable {
    private let honest: any E2EEDirectoryClientProviding
    private let drops: UInt32?
    private let failsFor: String?
    private let rewrite: @Sendable (E2EEDeviceBundle) -> E2EEDeviceBundle

    init(
        honest: any E2EEDirectoryClientProviding, drops: UInt32? = nil, failsFor: String? = nil,
        rewrite: @escaping @Sendable (E2EEDeviceBundle) -> E2EEDeviceBundle
    ) {
        self.honest = honest
        self.drops = drops
        self.failsFor = failsFor
        self.rewrite = rewrite
    }

    func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        if userId == failsFor { throw URLError(.notConnectedToInternet) }
        let served = try await honest.bundles(userId: userId, deviceIds: deviceIds)
        return E2EEUserBundles(userId: served.userId, devices: served.devices.filter { $0.deviceId != drops }.map(rewrite))
    }

    func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment { try await honest.enroll(request) }
    func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock { try await honest.publishKeys(deviceId: deviceId, request) }
    func preKeyStock() async throws -> E2EEPreKeyStock { try await honest.preKeyStock() }
    func retireDevice(deviceId: UInt32) async throws -> E2EERetirement { try await honest.retireDevice(deviceId: deviceId) }
    func devices(userId: String) async throws -> E2EEUserDevices { try await honest.devices(userId: userId) }
    func ownDevices() async throws -> [E2EEOwnDeviceDetails] { try await honest.ownDevices() }
    func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage { try await honest.envelopes(after: cursor, limit: limit) }
    func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult { try await honest.acknowledge(envelopeIds: envelopeIds) }
}
