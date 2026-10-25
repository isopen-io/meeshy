import Foundation
import LibSignalClient

/// L'empreinte libsignal entre deux identités (le « numéro de sécurité ») :
/// `NumericFingerprintGenerator`, version 2, 5 200 itérations — les valeurs de
/// Signal. Les deux côtés affichent les MÊMES 60 chiffres ; le code scannable de
/// l'un ne correspond qu'au code de l'autre (`compare(againstEncoding:)`).
public enum E2EEFingerprint {
    public static let version = 2
    public static let iterations = 5200

    /// L'identifiant stable d'un appareil de compte : `<userId>.<deviceId>`, en
    /// UTF-8. Chaque plateforme l'écrit à l'identique, sinon deux appareils du
    /// même compte ne se reconnaîtraient jamais.
    public static func deviceIdentifier(userId: String, deviceId: UInt32) -> Data {
        Data("\(userId).\(deviceId)".utf8)
    }

    public static func between(
        local: (identifier: Data, key: PublicKey),
        remote: (identifier: Data, key: PublicKey)
    ) throws -> Fingerprint {
        try NumericFingerprintGenerator(iterations: iterations).create(
            version: version,
            localIdentifier: local.identifier, localKey: local.key,
            remoteIdentifier: remote.identifier, remoteKey: remote.key
        )
    }
}

/// Le code qu'un de mes appareils montre pour être approuvé par un autre (spec
/// § 3.5) : 60 chiffres à comparer, et l'encodage du QR. Il porte la clé
/// d'identité avec laquelle il a été calculé : c'est CETTE clé qui s'épingle si
/// l'utilisateur confirme, jamais une clé relue entre-temps au serveur.
public struct E2EEPairingCode: Equatable, Sendable {
    public let deviceId: UInt32
    public let identityKey: Data
    public let displayable: String
    public let scannable: Data
}

public struct E2EEOwnDeviceStatus: Equatable, Sendable {
    public let deviceId: UInt32
    public let registrationId: UInt32
    public let approved: Bool
}

public enum E2EEOwnDeviceLinkingError: Error, Equatable {
    /// L'annuaire n'annonce pas (ou plus) cet appareil sur mon compte.
    case unknownDevice(UInt32)
    /// La clé que je connais pour cet appareil n'est plus celle du code montré.
    case identityChanged(UInt32)
}

/// L'approbation de mes propres appareils (spec § 3.5, #12976). Un sens à la
/// fois : l'appareil A approuve B en lisant le code de B, puis B approuve A en
/// lisant celui de A. Rien n'est épinglé sans une correspondance d'empreinte :
/// une clé substituée par le serveur donne une autre empreinte.
public protocol E2EEOwnDeviceLinkingProviding: Sendable {
    func ownDevices() async throws -> [E2EEOwnDeviceStatus]
    func pairingCode(towards deviceId: UInt32) async throws -> E2EEPairingCode
    /// Approuve celui de mes appareils non approuvés dont l'empreinte correspond
    /// au code lu ; `nil` si aucun ne correspond.
    func approve(scanned encoding: Data) async throws -> UInt32?
    /// Approuve après comparaison visuelle des 60 chiffres de `code`.
    func approve(confirmed code: E2EEPairingCode) throws
    func revoke(deviceId: UInt32) throws
}

public final class E2EEOwnDeviceLinking: E2EEOwnDeviceLinkingProviding {
    private let local: E2EEEnrolledDevice
    private let cipher: any E2EESessionCipherProviding
    private let directory: any E2EEDirectoryClientProviding
    private let approvals: E2EEOwnDeviceApprovals

    public init(
        local: E2EEEnrolledDevice,
        cipher: any E2EESessionCipherProviding,
        directory: any E2EEDirectoryClientProviding,
        approvals: E2EEOwnDeviceApprovals
    ) {
        self.local = local
        self.cipher = cipher
        self.directory = directory
        self.approvals = approvals
    }

    public func ownDevices() async throws -> [E2EEOwnDeviceStatus] {
        try await others().map { listing in
            E2EEOwnDeviceStatus(
                deviceId: listing.deviceId, registrationId: listing.registrationId,
                approved: try isApproved(listing)
            )
        }
    }

    public func pairingCode(towards deviceId: UInt32) async throws -> E2EEPairingCode {
        guard let listing = try await others().first(where: { $0.deviceId == deviceId }) else {
            throw E2EEOwnDeviceLinkingError.unknownDevice(deviceId)
        }
        return try code(towards: listing.deviceId, identityKey: try await identity(of: listing))
    }

    public func approve(scanned encoding: Data) async throws -> UInt32? {
        for listing in try await others() where try !isApproved(listing) {
            let identityKey = try await identity(of: listing)
            let fingerprint = try fingerprint(towards: listing.deviceId, identityKey: identityKey)
            guard (try? fingerprint.scannable.compare(againstEncoding: encoding)) == true else { continue }
            try approvals.approve(deviceId: listing.deviceId, identityKey: identityKey)
            return listing.deviceId
        }
        return nil
    }

    public func approve(confirmed code: E2EEPairingCode) throws {
        let address = E2EEDeviceAddress(userId: local.device.userId, deviceId: code.deviceId)
        guard try cipher.remoteIdentity(of: address) == code.identityKey else {
            throw E2EEOwnDeviceLinkingError.identityChanged(code.deviceId)
        }
        try approvals.approve(deviceId: code.deviceId, identityKey: code.identityKey)
    }

    public func revoke(deviceId: UInt32) throws {
        try approvals.revoke(deviceId: deviceId)
    }

    private func others() async throws -> [E2EEDeviceListing] {
        try await directory.devices(userId: local.device.userId).devices.filter { $0.deviceId != local.device.deviceId }
    }

    private func address(of listing: E2EEDeviceListing) -> E2EEDeviceAddress {
        E2EEDeviceAddress(userId: local.device.userId, deviceId: listing.deviceId)
    }

    private func isApproved(_ listing: E2EEDeviceListing) throws -> Bool {
        guard let pinned = try approvals.approvedIdentity(of: listing.deviceId) else { return false }
        return try cipher.remoteIdentity(of: address(of: listing)) == pinned
    }

    /// La clé d'identité de l'appareil : celle de la session courante si elle
    /// vise la génération annoncée, sinon celle d'un bundle frais, dont la
    /// session ouverte servira aussi au prochain envoi (la pré-clé réservée
    /// n'est pas perdue).
    private func identity(of listing: E2EEDeviceListing) async throws -> Data {
        let address = address(of: listing)
        if try cipher.remoteRegistrationId(of: address) == listing.registrationId, let known = try cipher.remoteIdentity(of: address) {
            return known
        }
        let bundles = try await directory.bundles(userId: local.device.userId, deviceIds: [listing.deviceId]).devices
        guard let bundle = bundles.first(where: { $0.deviceId == listing.deviceId }) else {
            throw E2EEOwnDeviceLinkingError.unknownDevice(listing.deviceId)
        }
        try cipher.deleteSession(with: address)
        try cipher.startSession(with: bundle, of: local.device.userId)
        guard let opened = try cipher.remoteIdentity(of: address) else {
            throw E2EEOwnDeviceLinkingError.unknownDevice(listing.deviceId)
        }
        return opened
    }

    private func fingerprint(towards deviceId: UInt32, identityKey: Data) throws -> Fingerprint {
        let userId = local.device.userId
        return try E2EEFingerprint.between(
            local: (E2EEFingerprint.deviceIdentifier(userId: userId, deviceId: local.device.deviceId), local.identity.keyPair.publicKey),
            remote: (E2EEFingerprint.deviceIdentifier(userId: userId, deviceId: deviceId), try PublicKey(identityKey))
        )
    }

    private func code(towards deviceId: UInt32, identityKey: Data) throws -> E2EEPairingCode {
        let fingerprint = try fingerprint(towards: deviceId, identityKey: identityKey)
        return E2EEPairingCode(
            deviceId: deviceId, identityKey: identityKey,
            displayable: fingerprint.displayable.formatted, scannable: fingerprint.scannable.encoding
        )
    }
}
