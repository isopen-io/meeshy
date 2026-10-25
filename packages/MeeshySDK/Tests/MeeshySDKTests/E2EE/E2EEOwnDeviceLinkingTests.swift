import Foundation
import LibSignalClient
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// L'approbation de mes propres appareils (spec § 3.5, #12976) : sans elle, mes
/// messages chiffrés n'atteignent jamais mon autre appareil. Modèle de menace :
/// serveur compromis qui ajoute un appareil à mon compte ou substitue la clé
/// d'identité d'un de mes appareils dans l'annuaire.
final class E2EEOwnDeviceLinkingTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    private func linking(of peer: E2EETestPeer, directory: (any E2EEDirectoryClientProviding)? = nil) -> E2EEOwnDeviceLinking {
        E2EEOwnDeviceLinking(local: peer.enrolled, cipher: peer.cipher, directory: directory ?? peer.directory, approvals: peer.approvals)
    }

    private func send(_ text: String, from sender: E2EETestPeer, to peer: String, on server: FakeE2EEServer) async throws -> E2EESealedMessage {
        let sealed = try await sender.sealer.seal(sender.content(text), to: peer)
        try server.relay(sealed, from: sender.userId, conversationId: "conv1", participants: [sender.userId, peer], messageId: "m1")
        return sealed
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

    func test_deviceIdentifier_isUserIdDotDeviceId_inUTF8() {
        XCTAssertEqual(E2EEFingerprint.deviceIdentifier(userId: "abc", deviceId: 3), Data("abc.3".utf8))
    }

    // MARK: - Approbation

    func test_myTwoDevices_showTheSameSixtyDigits() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)

        let onIPhone = try await linking(of: iPhone).pairingCode(towards: mac.device.deviceId)
        let onMac = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)

        XCTAssertEqual(onIPhone.displayable, onMac.displayable)
        XCTAssertEqual(onIPhone.displayable.count, 60)
        XCTAssertNotEqual(onIPhone.scannable, onMac.scannable)
    }

    func test_scanningEachOthersCode_approvesBothWays_andMyMessageReachesMyOtherDevice() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        let sentinel = "sentinelle-\(UUID().uuidString)"

        let macCode = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        let approvedByIPhone = try await linking(of: iPhone).approve(scanned: macCode.scannable)
        let iPhoneCode = try await linking(of: iPhone).pairingCode(towards: mac.device.deviceId)
        let approvedByMac = try await linking(of: mac).approve(scanned: iPhoneCode.scannable)
        let sealed = try await send(sentinel, from: iPhone, to: bob, on: server)

        XCTAssertEqual(approvedByIPhone, mac.device.deviceId)
        XCTAssertEqual(approvedByMac, iPhone.device.deviceId)
        XCTAssertEqual(sealed.unapprovedOwnDevices, [])
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: mac.device.deviceId).first)
        guard case .opened(let message) = mac.opener.open(copy) else { return XCTFail("ma copie reste illisible") }
        XCTAssertEqual(message.content.text, sentinel)
        XCTAssertNil(server.wire.reduce(Data(), +).range(of: Data(sentinel.utf8)), "aucun octet clair sur le fil")
    }

    func test_ownDevices_saysWhichOfMyDevicesIsApproved() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        let iPad = try await E2EETestPeer.enroll(alice, on: server)

        let macCode = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        _ = try await linking(of: iPhone).approve(scanned: macCode.scannable)
        let listed = try await linking(of: iPhone).ownDevices()

        XCTAssertEqual(listed.map(\.deviceId), [mac.device.deviceId, iPad.device.deviceId])
        XCTAssertEqual(listed.map(\.approved), [true, false])
    }

    func test_aKeySubstitutedByTheServer_neverMatches_andNothingIsPinned() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        let elsewhere = FakeE2EEServer()
        let mallory = try await E2EETestPeer.enroll(alice, on: elsewhere)
        let malloryBundle = try XCTUnwrap(try await mallory.directory.bundles(userId: alice, deviceIds: nil).devices.first)
        let lying = SubstitutingDirectory(
            honest: iPhone.directory,
            substitute: E2EEDeviceBundle(
                deviceId: mac.device.deviceId, registrationId: mac.device.registrationId, identityKey: malloryBundle.identityKey,
                signedPreKey: malloryBundle.signedPreKey, kyberPreKey: malloryBundle.kyberPreKey, preKey: malloryBundle.preKey
            )
        )

        let macCode = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        let approved = try await linking(of: iPhone, directory: lying).approve(scanned: macCode.scannable)
        let sealed = try await send("non", from: iPhone, to: bob, on: server)

        XCTAssertNil(approved)
        XCTAssertNil(try iPhone.approvals.approvedIdentity(of: mac.device.deviceId))
        XCTAssertEqual(sealed.unapprovedOwnDevices, [mac.device.deviceId])
    }

    func test_aContactsCode_orGarbage_approvesNothing_andDoesNotThrow() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let bobMac = try await E2EETestPeer.enroll(bob, on: server)
        let bobsOwnCode = try await linking(of: bobIPhone).pairingCode(towards: bobMac.device.deviceId)

        let fromContact = try await linking(of: iPhone).approve(scanned: bobsOwnCode.scannable)
        let fromGarbage = try await linking(of: iPhone).approve(scanned: Data("pas un code".utf8))

        XCTAssertNil(fromContact)
        XCTAssertNil(fromGarbage)
        XCTAssertNil(try iPhone.approvals.approvedIdentity(of: mac.device.deviceId))
    }

    func test_confirmingTheDigits_pinsTheKeyThatWasShown() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)

        let code = try await linking(of: iPhone).pairingCode(towards: mac.device.deviceId)
        try linking(of: iPhone).approve(confirmed: code)

        XCTAssertEqual(try iPhone.approvals.approvedIdentity(of: mac.device.deviceId), mac.identityKey)
    }

    func test_confirmingACodeWhoseKeyChangedSince_isRefused() async throws {
        let server = FakeE2EEServer()
        let iPhone = try await E2EETestPeer.enroll(alice, on: server)
        let mac = try await E2EETestPeer.enroll(alice, on: server)
        let code = try await linking(of: iPhone).pairingCode(towards: mac.device.deviceId)
        let stale = E2EEPairingCode(deviceId: code.deviceId, identityKey: Data(repeating: 7, count: 33), displayable: code.displayable, scannable: code.scannable)

        XCTAssertThrowsError(try linking(of: iPhone).approve(confirmed: stale)) { error in
            XCTAssertEqual(error as? E2EEOwnDeviceLinkingError, .identityChanged(mac.device.deviceId))
        }
        XCTAssertNil(try iPhone.approvals.approvedIdentity(of: mac.device.deviceId))
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
        let macCode = try await linking(of: mac).pairingCode(towards: iPhone.device.deviceId)
        _ = try await linking(of: iPhone).approve(scanned: macCode.scannable)

        try linking(of: iPhone).revoke(deviceId: mac.device.deviceId)
        let sealed = try await send("plus de copie", from: iPhone, to: bob, on: server)

        XCTAssertEqual(sealed.unapprovedOwnDevices, [mac.device.deviceId])
        XCTAssertTrue(server.pending(userId: alice, deviceId: mac.device.deviceId).isEmpty)
    }
}

/// Un annuaire qui ment sur UN bundle de mon compte : celui qu'un serveur
/// compromis servirait pour me faire épingler sa clé à la place de mon Mac.
private final class SubstitutingDirectory: E2EEDirectoryClientProviding, @unchecked Sendable {
    private let honest: any E2EEDirectoryClientProviding
    private let substitute: E2EEDeviceBundle

    init(honest: any E2EEDirectoryClientProviding, substitute: E2EEDeviceBundle) {
        self.honest = honest
        self.substitute = substitute
    }

    func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        let served = try await honest.bundles(userId: userId, deviceIds: deviceIds)
        return E2EEUserBundles(userId: served.userId, devices: served.devices.map { $0.deviceId == substitute.deviceId ? substitute : $0 })
    }

    func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment { try await honest.enroll(request) }
    func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock { try await honest.publishKeys(deviceId: deviceId, request) }
    func preKeyStock() async throws -> E2EEPreKeyStock { try await honest.preKeyStock() }
    func retireDevice(deviceId: UInt32) async throws -> E2EERetirement { try await honest.retireDevice(deviceId: deviceId) }
    func devices(userId: String) async throws -> E2EEUserDevices { try await honest.devices(userId: userId) }
    func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage { try await honest.envelopes(after: cursor, limit: limit) }
    func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult { try await honest.acknowledge(envelopeIds: envelopeIds) }
}
