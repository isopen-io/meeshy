import Foundation
import MeeshySDK

/// Cet appareil, enrôlé, avec l'identité sous laquelle il l'a été : les stores
/// et le chiffreur se construisent depuis CETTE identité, jamais une autre.
public struct E2EEEnrolledDevice: Sendable {
    public let device: E2EELocalDevice
    public let identity: E2EELocalIdentity

    public init(device: E2EELocalDevice, identity: E2EELocalIdentity) {
        self.device = device
        self.identity = identity
    }
}

public enum E2EEEnrollmentError: Error, Equatable {
    /// Le compte a déjà `E2EE_MAX_ACTIVE_DEVICES` appareils actifs : il faut en
    /// retirer un pour chiffrer sur celui-ci.
    case deviceLimitReached
}

/// L'enrôlement de CETTE installation auprès de l'annuaire (spec § 3.1 à 3.3),
/// et son entretien : une installation déjà enrôlée pour ce compte ne se
/// réenrôle pas à chaque lancement (le stock de pré-clés déborderait), elle
/// relit son stock et le complète. Elle se réenrôle quand la passerelle dit que
/// sa session ne la porte plus (nouvelle connexion), régénère son identité
/// quand le compte l'a révoquée, et efface tout quand le compte change.
public protocol E2EEDeviceRegistering: Sendable {
    func ensureEnrolled(userId: String) async throws -> E2EEEnrolledDevice
    /// Les appareils actifs de mon compte (pour en retirer un).
    func ownDevices(userId: String) async throws -> [E2EEDeviceListing]
    /// Retire un de mes appareils : son identité est révoquée sur le compte.
    func retire(deviceId: UInt32) async throws
    /// Efface identité, sessions, pré-clés et clairs de cet appareil.
    func reset() throws
}

public final class E2EEDeviceRegistrar: E2EEDeviceRegistering {
    private let identities: any E2EEIdentityVaultProviding
    private let vault: any E2EERecordVaultProviding
    private let lock: any E2EEProcessLockProviding
    private let directory: any E2EEDirectoryClientProviding
    private let platform: E2EEPlatform
    private let label: String?
    private let now: @Sendable () -> Date

    public init(
        identities: any E2EEIdentityVaultProviding,
        vault: any E2EERecordVaultProviding,
        lock: any E2EEProcessLockProviding,
        directory: any E2EEDirectoryClientProviding,
        platform: E2EEPlatform,
        label: String?,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.identities = identities
        self.vault = vault
        self.lock = lock
        self.directory = directory
        self.platform = platform
        self.label = label
        self.now = now
    }

    public func ensureEnrolled(userId: String) async throws -> E2EEEnrolledDevice {
        let recorded = try vault.read { try E2EELocalEnrollmentRecord.load(in: $0) }
        // Sans enrôlement local, l'identité du trousseau (qui survit à la
        // désinstallation) n'a plus ses sessions ni ses pré-clés : elle est
        // tirée de nouveau, et ses pairs reçoivent un 409 `stale` (#12882, § 4.5).
        if recorded?.userId != userId { try reset() }
        let identity = try currentOrCreateIdentity()
        if let recorded, recorded.userId == userId, recorded.registrationId == identity.registrationId,
           let kept = try await stillBound(recorded, identity: identity) {
            return kept
        }
        let returning = recorded?.userId == userId
        return try await enroll(userId: userId, identity: identity, returning: returning, regenerateOnRevocation: true)
    }

    public func ownDevices(userId: String) async throws -> [E2EEDeviceListing] {
        try await directory.devices(userId: userId).devices
    }

    public func retire(deviceId: UInt32) async throws {
        _ = try await directory.retireDevice(deviceId: deviceId)
    }

    public func reset() throws {
        try lock.withLock {
            try vault.write { try $0.removeAll() }
            try identities.erase()
        }
    }

    /// L'enrôlement enregistré tient-il encore ? Le stock de pré-clés ne se lit
    /// que par l'appareil lié à la session : un refus `E2EE_DEVICE_NOT_BOUND`
    /// veut dire qu'une nouvelle connexion doit le relier.
    private func stillBound(_ recorded: E2EELocalDevice, identity: E2EELocalIdentity) async throws -> E2EEEnrolledDevice? {
        do {
            let stock = try await directory.preKeyStock()
            guard stock.deviceId == recorded.deviceId else { return nil }
            try await replenish(stock, identity: identity)
            return E2EEEnrolledDevice(device: recorded, identity: identity)
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.deviceNotBound {
            return nil
        }
    }

    private func enroll(userId: String, identity: E2EELocalIdentity, returning: Bool, regenerateOnRevocation: Bool) async throws -> E2EEEnrolledDevice {
        let factory = keyFactory(for: identity)
        let request = returning
            ? try factory.reenrollment(userId: userId, platform: platform, label: label, now: now())
            : try factory.enrollment(userId: userId, platform: platform, label: label, now: now())
        let enrollment: E2EEEnrollment
        do {
            enrollment = try await directory.enroll(request)
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.identityRevoked && regenerateOnRevocation {
            try reset()
            return try await enroll(userId: userId, identity: try currentOrCreateIdentity(), returning: false, regenerateOnRevocation: false)
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.deviceLimitReached {
            throw E2EEEnrollmentError.deviceLimitReached
        }
        let device = E2EELocalDevice(userId: userId, deviceId: enrollment.deviceId, registrationId: identity.registrationId)
        try vault.write { try E2EELocalEnrollmentRecord.save(device, in: $0) }
        if returning { try await replenish(try await directory.preKeyStock(), identity: identity) }
        return E2EEEnrolledDevice(device: device, identity: identity)
    }

    private func replenish(_ stock: E2EEPreKeyStock, identity: E2EELocalIdentity) async throws {
        guard let request = try keyFactory(for: identity).replenishment(for: stock, now: now()) else { return }
        _ = try await directory.publishKeys(deviceId: stock.deviceId, request)
    }

    private func keyFactory(for identity: E2EELocalIdentity) -> E2EEDeviceKeyFactory {
        E2EEDeviceKeyFactory(identity: identity, store: MeeshySignalProtocolStore(identity: identity), vault: vault, lock: lock)
    }

    /// Sous le verrou inter-processus : l'app et la NSE ne tirent jamais deux identités (#12666).
    private func currentOrCreateIdentity() throws -> E2EELocalIdentity {
        try lock.withLock {
            if let existing = try identities.current() { return existing }
            let created = E2EELocalIdentity.generate()
            try identities.store(created)
            return created
        }
    }
}
