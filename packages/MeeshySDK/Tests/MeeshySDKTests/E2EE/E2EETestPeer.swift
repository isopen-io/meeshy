import CryptoKit
import Foundation
import GRDB
import LibSignalClient
@testable import MeeshyE2EE
@testable import MeeshySDK

/// Une installation complète branchée sur la fausse passerelle : enrôlée par
/// le VRAI `E2EEDeviceRegistrar`, puis armée du vrai scelleur et du vrai
/// ouvreur sur ses stores persistants scellés.
struct E2EETestPeer {
    let userId: String
    let enrolled: E2EEEnrolledDevice
    let vault: E2EEGRDBRecordVault
    let directory: FakeE2EEDirectoryClient
    let approvals: E2EEOwnDeviceApprovals
    let plaintexts: E2EEPlaintextVault
    let signals: E2EESignalInbox
    let cipher: E2EESessionCipher
    let sealer: E2EEMessageSealer
    let opener: E2EEEnvelopeOpener

    var device: E2EELocalDevice { enrolled.device }

    static func enroll(
        _ userId: String,
        on server: FakeE2EEServer,
        session: String = UUID().uuidString,
        databasePath: String? = nil
    ) async throws -> E2EETestPeer {
        let writer: any DatabaseWriter = try databasePath.map { try DatabaseQueue(path: $0) } ?? DatabaseQueue()
        let vault = try E2EEGRDBRecordVault(writer: writer, sealingKey: SymmetricKey(size: .bits256))
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        let directory = server.client(userId: userId, sessionId: session)
        let registrar = E2EEDeviceRegistrar(
            identities: E2EEIdentityVault(secrets: E2EEInMemorySecretStore()), vault: vault, lock: lock,
            directory: directory, platform: .ios, label: "iPhone"
        )
        let enrolled = try await registrar.ensureEnrolled(userId: userId)
        let store = MeeshySignalProtocolStore(identity: enrolled.identity, ownUserId: enrolled.device.userId)
        let cipher = E2EESessionCipher(local: enrolled.device.address, store: store, vault: vault, lock: lock)
        let approvals = E2EEOwnDeviceApprovals(vault: vault)
        let plaintexts = E2EEPlaintextVault(vault: vault)
        let signals = E2EESignalInbox(vault: vault)
        return E2EETestPeer(
            userId: userId, enrolled: enrolled, vault: vault, directory: directory, approvals: approvals,
            plaintexts: plaintexts, signals: signals, cipher: cipher,
            sealer: E2EEMessageSealer(local: enrolled.device, cipher: cipher, directory: directory, approvals: approvals),
            opener: E2EEEnvelopeOpener(
                local: enrolled.device, cipher: cipher, plaintexts: plaintexts, directory: directory, approvals: approvals, signals: signals
            )
        )
    }

    var identityKey: Data { enrolled.identity.keyPair.identityKey.serialize() }

    func approve(_ other: E2EETestPeer) throws {
        try approvals.approve(deviceId: other.device.deviceId, identityKey: other.identityKey)
    }

    func content(_ text: String, in conversationId: String = "conv1", clientMessageId: String = "cid_1") -> E2EEContent {
        E2EEContent(text: text, language: "fr", replyTo: nil, conversationId: conversationId, clientMessageId: clientMessageId, sentAt: Date())
    }
}
