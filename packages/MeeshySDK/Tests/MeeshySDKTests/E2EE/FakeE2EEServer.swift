import Foundation
@testable import MeeshyE2EE
@testable import MeeshySDK

/// Une passerelle en mémoire qui tient ce que la vraie tient (spec § 3.3 à
/// 4.3) : un annuaire d'appareils par compte lié à une session, des pré-clés
/// uniques réservées une seule fois, la comparaison Sesame d'un envoi et un
/// relais d'enveloppes par génération d'appareil. Elle ne voit QUE ce que le
/// fil lui donne — c'est ce qui permet d'y chercher un octet clair.
final class FakeE2EEServer: @unchecked Sendable {
    struct Device {
        var deviceId: UInt32
        var registrationId: UInt32
        var identityKey: String
        var sessionId: String
        var signedPreKey: E2EESignedKey
        var kyberLastResort: E2EESignedKey
        var oneTimePreKeys: [E2EEOneTimeKey]
        var kyberPreKeys: [E2EESignedKey]
        var retired = false
    }

    private let lock = NSLock()
    private var devices: [String: [Device]] = [:]
    private var revoked: Set<String> = []
    private var queued: [String: [E2EEServedEnvelope]] = [:]
    private var nextEnvelope = 0
    private(set) var wire: [Data] = []
    var maxActiveDevices = 16

    func client(userId: String, sessionId: String) -> FakeE2EEDirectoryClient {
        FakeE2EEDirectoryClient(server: self, userId: userId, sessionId: sessionId)
    }

    func activeDevices(of userId: String) -> [Device] {
        lock.withLock { (devices[userId] ?? []).filter { !$0.retired } }
    }

    /// Ce que fait `E2EEEnvelopeRelay.admit` puis `persist` : Sesame, puis une enveloppe par génération.
    func relay(_ sealed: E2EESealedMessage, from sender: String, conversationId: String, participants: [String], messageId: String) throws {
        let mismatch = lock.withLock { () -> E2EEDevicesMismatch in
            let expected = participants.flatMap { user in
                (devices[user] ?? []).filter { !$0.retired }
                    .filter { !(user == sender && ($0.deviceId == sealed.senderDeviceId || sealed.unapprovedOwnDevices.contains($0.deviceId))) }
                    .map { (E2EEDeviceRef(userId: user, deviceId: $0.deviceId), $0.registrationId) }
            }
            let expectedRefs = Dictionary(expected, uniquingKeysWith: { first, _ in first })
            let addressed = sealed.envelopes.map { E2EEDeviceRef(userId: $0.userId, deviceId: $0.deviceId) }
            let extra = addressed.filter { expectedRefs[$0] == nil }
            let staleByGeneration = sealed.envelopes.compactMap { envelope -> E2EEDeviceRef? in
                let ref = E2EEDeviceRef(userId: envelope.userId, deviceId: envelope.deviceId)
                guard let registrationId = expectedRefs[ref], registrationId != envelope.registrationId else { return nil }
                return ref
            }
            let missing = expectedRefs.keys.filter { !addressed.contains($0) }.sorted { "\($0.userId).\($0.deviceId)" < "\($1.userId).\($1.deviceId)" }
            return E2EEDevicesMismatch(missing: missing, extra: extra, stale: staleByGeneration)
        }
        guard mismatch.missing.isEmpty, mismatch.extra.isEmpty, mismatch.stale.isEmpty else { throw mismatch }
        lock.withLock {
            wire.append(try! JSONEncoder().encode(sealed.envelopes))
            sealed.envelopes.forEach { envelope in
                nextEnvelope += 1
                let served = E2EEServedEnvelope(
                    id: "env\(nextEnvelope)", messageId: messageId, conversationId: conversationId,
                    recipientRegistrationId: envelope.registrationId, senderUserId: sender,
                    senderDeviceId: sealed.senderDeviceId, type: envelope.type, body: envelope.body,
                    createdAt: "2026-10-24T12:00:00.000Z"
                )
                queued["\(envelope.userId).\(envelope.deviceId)", default: []].append(served)
            }
        }
    }

    /// Les enveloppes en attente d'un appareil (ce que la socket lui pousserait).
    func pending(userId: String, deviceId: UInt32) -> [E2EEServedEnvelope] {
        lock.withLock { queued["\(userId).\(deviceId)"] ?? [] }
    }

    func revoke(userId: String, deviceId: UInt32) {
        lock.withLock {
            guard let index = devices[userId]?.firstIndex(where: { $0.deviceId == deviceId && !$0.retired }) else { return }
            revoked.insert("\(userId).\(devices[userId]![index].identityKey)")
            devices[userId]![index].retired = true
        }
    }

    /// Une nouvelle connexion : la session d'avant ne porte plus l'appareil.
    func endSession(userId: String, sessionId: String) {
        lock.withLock {
            devices[userId] = devices[userId]?.map { device in
                var copy = device
                if copy.sessionId == sessionId { copy.sessionId = "ended" }
                return copy
            }
        }
    }

    // MARK: - Les routes, vues du serveur

    fileprivate func enroll(_ request: E2EEEnrollDeviceRequest, userId: String, sessionId: String) throws -> E2EEEnrollment {
        try lock.withLock {
            if revoked.contains("\(userId).\(request.identityKey)") { throw refusal(409, E2EEErrorCode.identityRevoked) }
            var list = devices[userId] ?? []
            if let index = list.firstIndex(where: { !$0.retired && $0.identityKey == request.identityKey && $0.registrationId == request.registrationId }) {
                list[index].sessionId = sessionId
                list[index].signedPreKey = request.signedPreKey
                list[index].kyberLastResort = request.kyberLastResort
                list[index].oneTimePreKeys += request.oneTimePreKeys
                list[index].kyberPreKeys += request.kyberPreKeys
                devices[userId] = list
                return E2EEEnrollment(deviceId: list[index].deviceId, created: false)
            }
            guard list.filter({ !$0.retired }).count < maxActiveDevices else { throw refusal(409, E2EEErrorCode.deviceLimitReached) }
            let taken = Set(list.filter { !$0.retired }.map(\.deviceId))
            let slot = (1...127).map(UInt32.init).first { !taken.contains($0) }!
            list.removeAll { $0.deviceId == slot }
            list.append(Device(
                deviceId: slot, registrationId: request.registrationId, identityKey: request.identityKey, sessionId: sessionId,
                signedPreKey: request.signedPreKey, kyberLastResort: request.kyberLastResort,
                oneTimePreKeys: request.oneTimePreKeys, kyberPreKeys: request.kyberPreKeys
            ))
            devices[userId] = list
            return E2EEEnrollment(deviceId: slot, created: true)
        }
    }

    fileprivate func bound(userId: String, sessionId: String) throws -> Device {
        guard let device = lock.withLock({ (devices[userId] ?? []).first { !$0.retired && $0.sessionId == sessionId } }) else {
            throw refusal(403, E2EEErrorCode.deviceNotBound)
        }
        return device
    }

    fileprivate func publish(_ request: E2EEPublishKeysRequest, userId: String, sessionId: String) throws -> E2EEPreKeyStock {
        let device = try bound(userId: userId, sessionId: sessionId)
        return lock.withLock {
            let index = devices[userId]!.firstIndex { $0.deviceId == device.deviceId && !$0.retired }!
            devices[userId]![index].oneTimePreKeys += request.oneTimePreKeys ?? []
            devices[userId]![index].kyberPreKeys += request.kyberPreKeys ?? []
            let updated = devices[userId]![index]
            return E2EEPreKeyStock(deviceId: updated.deviceId, oneTimePreKeys: updated.oneTimePreKeys.count, kyberPreKeys: updated.kyberPreKeys.count)
        }
    }

    fileprivate func bundles(of userId: String, deviceIds: [UInt32]?) -> E2EEUserBundles {
        lock.withLock {
            var list = devices[userId] ?? []
            let served = list.indices.filter { !list[$0].retired && (deviceIds?.contains(list[$0].deviceId) ?? true) }.map { index -> E2EEDeviceBundle in
                let preKey = list[index].oneTimePreKeys.isEmpty ? nil : list[index].oneTimePreKeys.removeFirst()
                let kyber = list[index].kyberPreKeys.isEmpty ? nil : list[index].kyberPreKeys.removeFirst()
                let device = list[index]
                return E2EEDeviceBundle(
                    deviceId: device.deviceId, registrationId: device.registrationId, identityKey: device.identityKey,
                    signedPreKey: device.signedPreKey,
                    kyberPreKey: kyber.map { E2EEKyberBundleKey(keyId: $0.keyId, publicKey: $0.publicKey, signature: $0.signature, lastResort: false) }
                        ?? E2EEKyberBundleKey(keyId: device.kyberLastResort.keyId, publicKey: device.kyberLastResort.publicKey, signature: device.kyberLastResort.signature, lastResort: true),
                    preKey: preKey
                )
            }
            devices[userId] = list
            return E2EEUserBundles(userId: userId, devices: served)
        }
    }

    fileprivate func envelopes(userId: String, sessionId: String, after cursor: String?, limit: Int) throws -> E2EEEnvelopePage {
        let device = try bound(userId: userId, sessionId: sessionId)
        let all = pending(userId: userId, deviceId: device.deviceId)
        let start = cursor.flatMap { id in all.firstIndex { $0.id == id }.map { $0 + 1 } } ?? 0
        let page = Array(all.dropFirst(start).prefix(limit))
        return E2EEEnvelopePage(envelopes: page, nextCursor: page.count == limit ? page.last?.id : nil)
    }

    fileprivate func acknowledge(_ ids: [String], userId: String, sessionId: String) throws -> E2EEAckResult {
        let device = try bound(userId: userId, sessionId: sessionId)
        return lock.withLock {
            let key = "\(userId).\(device.deviceId)"
            let before = queued[key]?.count ?? 0
            queued[key]?.removeAll { ids.contains($0.id) }
            return E2EEAckResult(deleted: before - (queued[key]?.count ?? 0))
        }
    }

    fileprivate func retire(deviceId: UInt32, userId: String) -> E2EERetirement {
        revoke(userId: userId, deviceId: deviceId)
        return E2EERetirement(deviceId: deviceId, retired: true)
    }

    private func refusal(_ status: Int, _ code: String) -> MeeshyError {
        .rejected(APIRejection(statusCode: status, code: code, message: code))
    }
}

/// Le client de l'annuaire d'UN appareil : chaque appel part au nom de sa session.
final class FakeE2EEDirectoryClient: E2EEDirectoryClientProviding, @unchecked Sendable {
    let server: FakeE2EEServer
    let userId: String
    let sessionId: String
    private let lock = NSLock()
    private var calls: [String] = []

    init(server: FakeE2EEServer, userId: String, sessionId: String) {
        self.server = server
        self.userId = userId
        self.sessionId = sessionId
    }

    var log: [String] { lock.withLock { calls } }
    private func record(_ call: String) { lock.withLock { calls.append(call) } }

    func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment {
        record("enroll:\(request.oneTimePreKeys.count)")
        return try server.enroll(request, userId: userId, sessionId: sessionId)
    }

    func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock {
        record("publish")
        return try server.publish(request, userId: userId, sessionId: sessionId)
    }

    func preKeyStock() async throws -> E2EEPreKeyStock {
        record("stock")
        let device = try server.bound(userId: userId, sessionId: sessionId)
        return E2EEPreKeyStock(deviceId: device.deviceId, oneTimePreKeys: device.oneTimePreKeys.count, kyberPreKeys: device.kyberPreKeys.count)
    }

    func retireDevice(deviceId: UInt32) async throws -> E2EERetirement {
        record("retire:\(deviceId)")
        return server.retire(deviceId: deviceId, userId: userId)
    }

    func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        record("bundles:\(userId)")
        return server.bundles(of: userId, deviceIds: deviceIds)
    }

    func devices(userId: String) async throws -> E2EEUserDevices {
        E2EEUserDevices(userId: userId, devices: server.activeDevices(of: userId).map {
            E2EEDeviceListing(deviceId: $0.deviceId, registrationId: $0.registrationId)
        })
    }

    func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage {
        try server.envelopes(userId: userId, sessionId: sessionId, after: cursor, limit: limit ?? 100)
    }

    func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult {
        record("ack:\(envelopeIds.count)")
        return try server.acknowledge(envelopeIds, userId: userId, sessionId: sessionId)
    }
}

extension FakeE2EEServer {
    func bundlesForTest(of userId: String) -> E2EEUserBundles { bundles(of: userId, deviceIds: nil) }
}
