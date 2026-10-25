import CryptoKit
import Foundation
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Une passerelle en mémoire pour des installations libsignal RÉELLES de l'app
/// (#12916) : un annuaire d'appareils par compte, des pré-clés uniques servies
/// une seule fois, et un relais d'enveloppes par appareil. Elle ne voit que ce
/// que le fil lui donne — c'est ce qui permet d'y chercher un octet clair.
/// Sesame n'y est pas rejoué : les témoins qui s'en servent suivent un message
/// jusqu'au pixel, pas la comparaison des appareils (couverte côté SDK).
nonisolated final class LibsignalTestGateway: @unchecked Sendable {
    fileprivate struct Device {
        let userId: String
        let deviceId: UInt32
        let registrationId: UInt32
        let identityKey: String
        let sessionId: String
        let platform: E2EEPlatform
        let label: String?
        var signedPreKey: E2EESignedKey
        var kyberLastResort: E2EESignedKey
        var oneTimePreKeys: [E2EEOneTimeKey]
        var kyberPreKeys: [E2EESignedKey]
    }

    private let lock = NSLock()
    private var devices: [Device] = []
    private var queued: [String: [E2EEServedEnvelope]] = [:]
    private var nextEnvelope = 0
    private(set) var wire: [Data] = []

    func directory(userId: String, sessionId: String = UUID().uuidString) -> LibsignalTestDirectory {
        LibsignalTestDirectory(gateway: self, userId: userId, sessionId: sessionId)
    }

    /// Ce que fait `E2EEEnvelopeRelay.persist` : une enveloppe par appareil adressé.
    func relay(_ sealed: E2EESealedMessage, from sender: String, conversationId: String, messageId: String) {
        lock.withLock {
            wire.append((try? JSONEncoder().encode(sealed.envelopes)) ?? Data())
            sealed.envelopes.forEach { envelope in
                nextEnvelope += 1
                queued[Self.key(envelope.userId, envelope.deviceId), default: []].append(E2EEServedEnvelope(
                    id: "env\(nextEnvelope)", messageId: messageId, conversationId: conversationId,
                    recipientRegistrationId: envelope.registrationId, senderUserId: sender,
                    senderDeviceId: sealed.senderDeviceId, type: envelope.type, body: envelope.body,
                    enrolledAt: "2026-10-25T12:00:00.000Z"
                ))
            }
        }
    }

    /// Les enveloppes en attente des appareils de ce compte (ce que la socket leur pousserait).
    func pending(for userId: String) -> [E2EEServedEnvelope] {
        lock.withLock { queued.filter { $0.key.hasPrefix("\(userId).") }.flatMap(\.value) }
    }

    private static func key(_ userId: String, _ deviceId: UInt32) -> String { "\(userId).\(deviceId)" }

    fileprivate func enroll(_ request: E2EEEnrollDeviceRequest, userId: String, sessionId: String) -> E2EEEnrollment {
        lock.withLock {
            let deviceId = UInt32(devices.filter { $0.userId == userId }.count + 1)
            devices.append(Device(
                userId: userId, deviceId: deviceId, registrationId: request.registrationId,
                identityKey: request.identityKey, sessionId: sessionId,
                platform: request.platform, label: request.label,
                signedPreKey: request.signedPreKey, kyberLastResort: request.kyberLastResort,
                oneTimePreKeys: request.oneTimePreKeys, kyberPreKeys: request.kyberPreKeys
            ))
            return Self.transcode(EnrollmentWire(deviceId: deviceId, created: true))
        }
    }

    fileprivate func bound(userId: String, sessionId: String) throws -> Device {
        guard let device = lock.withLock({ devices.first { $0.userId == userId && $0.sessionId == sessionId } }) else {
            throw MeeshyError.rejected(APIRejection(statusCode: 403, code: E2EEErrorCode.deviceNotBound, message: "unbound"))
        }
        return device
    }

    fileprivate func publish(_ request: E2EEPublishKeysRequest, userId: String, sessionId: String) throws -> E2EEPreKeyStock {
        let device = try bound(userId: userId, sessionId: sessionId)
        return lock.withLock {
            let index = devices.firstIndex { $0.userId == userId && $0.deviceId == device.deviceId }!
            devices[index].oneTimePreKeys += request.oneTimePreKeys ?? []
            devices[index].kyberPreKeys += request.kyberPreKeys ?? []
            return Self.stock(of: devices[index])
        }
    }

    fileprivate func stock(userId: String, sessionId: String) throws -> E2EEPreKeyStock {
        Self.stock(of: try bound(userId: userId, sessionId: sessionId))
    }

    fileprivate func bundles(of userId: String, deviceIds: [UInt32]?) -> E2EEUserBundles {
        lock.withLock {
            let served = devices.indices
                .filter { devices[$0].userId == userId && (deviceIds?.contains(devices[$0].deviceId) ?? true) }
                .map { index -> BundleWire in
                    let preKey = devices[index].oneTimePreKeys.isEmpty ? nil : devices[index].oneTimePreKeys.removeFirst()
                    let kyber = devices[index].kyberPreKeys.isEmpty ? nil : devices[index].kyberPreKeys.removeFirst()
                    let device = devices[index]
                    let kyberKey = kyber.map { KyberWire(keyId: $0.keyId, publicKey: $0.publicKey, signature: $0.signature, lastResort: false) }
                        ?? KyberWire(keyId: device.kyberLastResort.keyId, publicKey: device.kyberLastResort.publicKey,
                                     signature: device.kyberLastResort.signature, lastResort: true)
                    return BundleWire(
                        deviceId: device.deviceId, registrationId: device.registrationId, identityKey: device.identityKey,
                        signedPreKey: device.signedPreKey, kyberPreKey: kyberKey, preKey: preKey
                    )
                }
            return Self.transcode(UserBundlesWire(userId: userId, devices: served))
        }
    }

    fileprivate func listing(of userId: String) -> E2EEUserDevices {
        let listed = lock.withLock { devices.filter { $0.userId == userId } }
            .map { ListingWire(deviceId: $0.deviceId, registrationId: $0.registrationId) }
        return Self.transcode(UserDevicesWire(userId: userId, devices: listed))
    }

    /// `GET /e2ee/devices` : mes appareils, leurs métadonnées, et le mien marqué.
    fileprivate func ownDevices(userId: String, sessionId: String) -> [E2EEOwnDeviceDetails] {
        lock.withLock { devices.filter { $0.userId == userId } }.map {
            E2EEOwnDeviceDetails(
                deviceId: $0.deviceId, registrationId: $0.registrationId, platform: $0.platform, label: $0.label,
                enrolledAt: Date(timeIntervalSince1970: 1_792_929_600), lastSeenAt: nil, current: $0.sessionId == sessionId
            )
        }
    }

    fileprivate func envelopes(userId: String, sessionId: String) throws -> E2EEEnvelopePage {
        let device = try bound(userId: userId, sessionId: sessionId)
        let page = lock.withLock { queued[Self.key(userId, device.deviceId)] ?? [] }
        return Self.transcode(PageWire(envelopes: page, nextCursor: nil))
    }

    fileprivate func acknowledge(_ ids: [String], userId: String, sessionId: String) throws -> E2EEAckResult {
        let device = try bound(userId: userId, sessionId: sessionId)
        return lock.withLock {
            let key = Self.key(userId, device.deviceId)
            let before = queued[key]?.count ?? 0
            queued[key]?.removeAll { ids.contains($0.id) }
            return Self.transcode(AckWire(deleted: before - (queued[key]?.count ?? 0)))
        }
    }

    private static func stock(of device: Device) -> E2EEPreKeyStock {
        transcode(StockWire(deviceId: device.deviceId, oneTimePreKeys: device.oneTimePreKeys.count, kyberPreKeys: device.kyberPreKeys.count))
    }

    /// Les réponses de la passerelle sont `Decodable` sans initialiseur public :
    /// on les fabrique comme le transport, depuis leur JSON.
    private static func transcode<T: Decodable>(_ value: some Encodable) -> T {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
    }

    private struct EnrollmentWire: Encodable { let deviceId: UInt32; let created: Bool }
    private struct StockWire: Encodable { let deviceId: UInt32; let oneTimePreKeys: Int; let kyberPreKeys: Int }
    private struct KyberWire: Encodable { let keyId: UInt32; let publicKey: String; let signature: String; let lastResort: Bool }
    private struct BundleWire: Encodable {
        let deviceId: UInt32
        let registrationId: UInt32
        let identityKey: String
        let signedPreKey: E2EESignedKey
        let kyberPreKey: KyberWire
        let preKey: E2EEOneTimeKey?
    }
    private struct UserBundlesWire: Encodable { let userId: String; let devices: [BundleWire] }
    private struct ListingWire: Encodable { let deviceId: UInt32; let registrationId: UInt32 }
    private struct UserDevicesWire: Encodable { let userId: String; let devices: [ListingWire] }
    private struct PageWire: Encodable { let envelopes: [E2EEServedEnvelope]; let nextCursor: String? }
    private struct AckWire: Encodable { let deleted: Int }
}

/// Le client de l'annuaire d'UN appareil : chaque appel part au nom de sa session.
nonisolated final class LibsignalTestDirectory: E2EEDirectoryClientProviding, @unchecked Sendable {
    private let gateway: LibsignalTestGateway
    let userId: String
    let sessionId: String

    init(gateway: LibsignalTestGateway, userId: String, sessionId: String) {
        self.gateway = gateway
        self.userId = userId
        self.sessionId = sessionId
    }

    func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment {
        gateway.enroll(request, userId: userId, sessionId: sessionId)
    }

    func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock {
        try gateway.publish(request, userId: userId, sessionId: sessionId)
    }

    func preKeyStock() async throws -> E2EEPreKeyStock {
        try gateway.stock(userId: userId, sessionId: sessionId)
    }

    func retireDevice(deviceId: UInt32) async throws -> E2EERetirement {
        throw CocoaError(.featureUnsupported)
    }

    func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        gateway.bundles(of: userId, deviceIds: deviceIds)
    }

    func devices(userId: String) async throws -> E2EEUserDevices {
        gateway.listing(of: userId)
    }

    func ownDevices() async throws -> [E2EEOwnDeviceDetails] {
        gateway.ownDevices(userId: userId, sessionId: sessionId)
    }

    func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage {
        try gateway.envelopes(userId: userId, sessionId: sessionId)
    }

    func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult {
        try gateway.acknowledge(envelopeIds, userId: userId, sessionId: sessionId)
    }
}

extension LibsignalDeviceProvisioning {
    /// L'installation RÉELLE de l'app (enrôlement, scelleur, ouvreur), sur une
    /// base scellée en mémoire et un trousseau en mémoire : seul le stockage
    /// change, le code qui prépare l'appareil est celui de la production.
    static func inMemory(on gateway: LibsignalTestGateway, userId: String) throws -> LibsignalDeviceProvisioning {
        let vault = try E2EEGRDBRecordVault(writer: try DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256))
        let lock = E2EEProcessLock(path: NSTemporaryDirectory() + "e2ee-\(UUID().uuidString).lock")
        return LibsignalDeviceProvisioning(
            directory: gateway.directory(userId: userId),
            secrets: E2EEInMemorySecretStore(),
            storage: { _ in (vault, lock) }
        )
    }
}
