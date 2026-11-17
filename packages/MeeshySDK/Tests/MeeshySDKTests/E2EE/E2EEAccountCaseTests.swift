import CryptoKit
import Foundation
import GRDB
import LibSignalClient
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// **Mon identifiant servi dans une autre casse ne contourne pas l'épingle de
/// mes appareils** (IOS-18, #18950).
///
/// « Moi » se reconnaissait à l'octet près : un serveur hostile qui servait mon
/// identifiant en MAJUSCULES (une base Mongo résout un ObjectId quelle que soit
/// sa casse) faisait passer un de mes appareils non approuvés pour l'appareil
/// d'un autre. Chaque témoin a son miroir dans la casse servie d'ordinaire.
final class E2EEAccountCaseTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let conversation = "conv1"

    func test_aPeerThatIsMeInAnotherCase_isRefusedBeforeAnySeal() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(alice, on: server)
        let folding = CaseFoldingDirectory(inner: aliceIPhone.directory)
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: folding, approvals: aliceIPhone.approvals)

        do {
            _ = try await sealer.seal(aliceIPhone.content("à moi-même"), to: alice.uppercased())
            XCTFail("un tête-à-tête avec moi-même n'existe pas")
        } catch {
            XCTAssertEqual(error as? E2EESealError, .peerIsSelf)
        }
        XCTAssertEqual(folding.bundleRequests, 0, "aucun bundle de mes appareils n'est réservé")
    }

    func test_aSendToMyUnapprovedDeviceUnderAnotherCase_isNotTrusted() throws {
        let identity = E2EELocalIdentity.generate()
        let store = MeeshySignalProtocolStore(identity: identity, ownUserId: alice)
        let vault = try E2EEGRDBRecordVault(writer: DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256))
        let unknown = IdentityKeyPair.generate().identityKey

        let trustedUppercased = try vault.write { transaction in
            try store.isTrustedIdentity(unknown, for: ProtocolAddress(name: self.alice.uppercased(), deviceId: 5), direction: .sending, context: transaction)
        }
        let trustedForAContact = try vault.write { transaction in
            try store.isTrustedIdentity(unknown, for: ProtocolAddress(name: self.bob, deviceId: 5), direction: .sending, context: transaction)
        }

        XCTAssertFalse(trustedUppercased, "mon compte, quelle que soit sa casse, exige l'épingle")
        XCTAssertTrue(trustedForAContact, "le miroir : un contact reste en TOFU")
    }

    func test_aCopyFromMyUnapprovedDeviceServedInAnotherCase_waitsForTheApproval() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        try aliceMac.approve(aliceIPhone)
        let sealed = try await aliceMac.sealer.seal(aliceMac.content("copie"), to: bob)
        try server.relay(sealed, from: alice, conversationId: conversation, participants: [alice, bob], messageId: "m1")
        let copy = try XCTUnwrap(server.pending(userId: alice, deviceId: aliceIPhone.device.deviceId).first)
        let recased = E2EEServedEnvelope(
            id: copy.id, messageId: copy.messageId, conversationId: copy.conversationId,
            recipientRegistrationId: copy.recipientRegistrationId, senderUserId: alice.uppercased(),
            senderDeviceId: copy.senderDeviceId, type: copy.type, body: copy.body, createdAt: copy.createdAt
        )

        XCTAssertEqual(aliceIPhone.opener.open(recased), .deferred(envelopeId: copy.id),
                       "un de mes appareils que je n'ai pas approuvé ne me fait rien dire, quelle que soit la casse servie")
        XCTAssertNil(try aliceIPhone.plaintexts.entry(for: "m1"))
    }

    func test_accountIds_compareWithoutCase() {
        XCTAssertTrue(E2EEAccountId.same(alice, alice.uppercased()))
        XCTAssertFalse(E2EEAccountId.same(alice, bob))
    }
}

/// Un annuaire qui résout un identifiant de compte quelle que soit sa casse,
/// comme une base qui le servirait ainsi.
private final class CaseFoldingDirectory: ForwardingE2EEDirectory {
    private let lock = NSLock()
    private var requests = 0

    var bundleRequests: Int { lock.withLock { requests } }

    override func devices(userId: String) async throws -> E2EEUserDevices {
        let served = try await inner.devices(userId: userId.lowercased())
        return E2EEUserDevices(userId: userId, devices: served.devices)
    }

    override func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        lock.withLock { requests += 1 }
        let served = try await inner.bundles(userId: userId.lowercased(), deviceIds: deviceIds)
        return E2EEUserBundles(userId: userId, devices: served.devices)
    }
}
