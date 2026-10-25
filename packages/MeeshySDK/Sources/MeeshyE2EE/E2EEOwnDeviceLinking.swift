import Foundation
import LibSignalClient

/// L'empreinte libsignal entre deux identités (le « numéro de sécurité ») :
/// `NumericFingerprintGenerator`, version 2, 5 200 itérations — les valeurs de
/// Signal. Les deux côtés affichent les MÊMES 60 chiffres ; le code scannable de
/// l'un ne correspond qu'au code de l'autre (`compare(againstEncoding:)`, qui
/// vérifie les deux moitiés).
public enum E2EEFingerprint {
    public static let version = 2
    public static let iterations = 5200

    /// L'identifiant stable d'un appareil de MON compte (spec § 3.5) :
    /// `meeshy-own-device:v1:<userId en minuscules>.<deviceId décimal>`, en
    /// UTF-8. Le préfixe sépare ce domaine de celui des numéros de sécurité
    /// d'un contact (#12520) : une empreinte calculée pour l'un ne vaut jamais
    /// pour l'autre. Chaque plateforme l'écrit à l'identique.
    public static func ownDeviceIdentifier(userId: String, deviceId: UInt32) -> Data {
        Data("meeshy-own-device:v1:\(userId.lowercased()).\(deviceId)".utf8)
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

/// Ce que porte le QR d'appairage : du TEXTE, pour que tout lecteur (caméra
/// iOS, navigateur, Android) le rende tel quel —
/// `meeshy-device-link:v1:<base64url sans remplissage de l'encodage scannable>`.
public enum E2EEPairingPayload {
    static let prefix = "meeshy-device-link:v1:"

    public static func encode(_ scannable: Data) -> String {
        prefix + scannable.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// `nil` pour tout ce qui n'est pas un code d'appairage de cette version.
    public static func decode(_ text: String) -> Data? {
        guard text.hasPrefix(prefix) else { return nil }
        let body = text.dropFirst(prefix.count)
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padded = body + String(repeating: "=", count: (4 - body.count % 4) % 4)
        return Data(base64Encoded: padded)
    }
}

/// Le code qu'un de mes appareils montre pour être approuvé par un autre.
public struct E2EEPairingCode: Equatable, Sendable {
    public let deviceId: UInt32
    /// Les 60 chiffres, à MONTRER seulement : leur comparaison à l'œil n'approuve
    /// rien dans ce lot (une moitié est la même sur les deux écrans quoi qu'il
    /// arrive ; spec § 3.5).
    public let displayable: String
    /// Le texte du QR (`E2EEPairingPayload`).
    public let qrPayload: String

    public init(deviceId: UInt32, displayable: String, qrPayload: String) {
        self.deviceId = deviceId
        self.displayable = displayable
        self.qrPayload = qrPayload
    }
}

/// L'appareil dont l'empreinte correspond au code lu. Rien n'est épinglé tant
/// que l'utilisateur ne l'a pas confirmé (`approve(_:)`), après avoir vu de
/// quel appareil il s'agit.
public struct E2EEPairingCandidate: Equatable, Sendable {
    public let deviceId: UInt32
    public let registrationId: UInt32
    public let identityKey: Data

    /// Réservé aux témoins : hors d'eux, seul `candidate(matching:)` fabrique
    /// un candidat, et c'est ce qui fait de ce type la preuve que l'empreinte
    /// correspond (`approve(_:)` ne la revérifie pas).
    @_spi(Testing)
    public init(deviceId: UInt32, registrationId: UInt32, identityKey: Data) {
        self.deviceId = deviceId
        self.registrationId = registrationId
        self.identityKey = identityKey
    }
}

public struct E2EEOwnDeviceStatus: Equatable, Sendable {
    public let deviceId: UInt32
    public let registrationId: UInt32
    public let approved: Bool

    public init(deviceId: UInt32, registrationId: UInt32, approved: Bool) {
        self.deviceId = deviceId
        self.registrationId = registrationId
        self.approved = approved
    }
}

public enum E2EEOwnDeviceLinkingError: Error, Equatable {
    /// L'annuaire n'annonce pas (ou plus) cet appareil sur mon compte.
    case unknownDevice(UInt32)
}

/// L'approbation de mes propres appareils (spec § 3.5, #12976). Un sens à la
/// fois : A lit le QR de B et confirme, puis B lit celui de A et confirme. Une
/// clé substituée par le serveur donne une autre empreinte : rien ne
/// correspond, rien ne s'épingle. Ce type ne touche JAMAIS aux sessions : il
/// lit une clé publique (session courante ou bundle) et range une approbation.
public protocol E2EEOwnDeviceLinkingProviding: Sendable {
    /// Mes autres appareils actifs. Une approbation d'un appareil que l'annuaire
    /// n'annonce plus est effacée : c'est le sens sûr.
    func ownDevices() async throws -> [E2EEOwnDeviceStatus]
    func pairingCode(towards deviceId: UInt32) async throws -> E2EEPairingCode
    /// Celui de mes appareils dont l'empreinte correspond au QR lu ; `nil` si
    /// aucun, ou si le texte n'est pas un code d'appairage.
    func candidate(matching qrPayload: String) async throws -> E2EEPairingCandidate?
    /// Épingle la clé du candidat, après confirmation de l'utilisateur.
    func approve(_ candidate: E2EEPairingCandidate) throws
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
        let listed = try await others()
        try forgetApprovals(notIn: listed)
        return try listed.map { listing in
            E2EEOwnDeviceStatus(deviceId: listing.deviceId, registrationId: listing.registrationId, approved: try isApproved(listing))
        }
    }

    public func pairingCode(towards deviceId: UInt32) async throws -> E2EEPairingCode {
        guard let listing = try await others().first(where: { $0.deviceId == deviceId }) else {
            throw E2EEOwnDeviceLinkingError.unknownDevice(deviceId)
        }
        let fingerprint = try fingerprint(towards: deviceId, identityKey: try await currentIdentity(of: listing))
        return E2EEPairingCode(
            deviceId: deviceId,
            displayable: fingerprint.displayable.formatted,
            qrPayload: E2EEPairingPayload.encode(fingerprint.scannable.encoding)
        )
    }

    public func candidate(matching qrPayload: String) async throws -> E2EEPairingCandidate? {
        guard let scanned = E2EEPairingPayload.decode(qrPayload) else { return nil }
        for listing in try await others() {
            guard let identityKey = try? await currentIdentity(of: listing),
                  let fingerprint = try? fingerprint(towards: listing.deviceId, identityKey: identityKey),
                  (try? fingerprint.scannable.compare(againstEncoding: scanned)) == true
            else { continue }
            return E2EEPairingCandidate(deviceId: listing.deviceId, registrationId: listing.registrationId, identityKey: identityKey)
        }
        return nil
    }

    public func approve(_ candidate: E2EEPairingCandidate) throws {
        try approvals.approve(deviceId: candidate.deviceId, identityKey: candidate.identityKey, registrationId: candidate.registrationId)
    }

    public func revoke(deviceId: UInt32) throws {
        try approvals.revoke(deviceId: deviceId)
    }

    private func others() async throws -> [E2EEDeviceListing] {
        try await directory.devices(userId: local.device.userId).devices.filter { $0.deviceId != local.device.deviceId }
    }

    private func address(of deviceId: UInt32) -> E2EEDeviceAddress {
        E2EEDeviceAddress(userId: local.device.userId, deviceId: deviceId)
    }

    private func forgetApprovals(notIn listed: [E2EEDeviceListing]) throws {
        let active = Set(listed.map(\.deviceId))
        try approvals.approvedDeviceIds().filter { !active.contains($0) }.forEach { try approvals.revoke(deviceId: $0) }
    }

    /// Approuvé : une approbation de la génération que l'annuaire annonce
    /// (une place reprise par une réinstallation n'en hérite pas, #12543), et
    /// aucune session de cette génération qui dise une AUTRE clé.
    private func isApproved(_ listing: E2EEDeviceListing) throws -> Bool {
        guard let approval = try approvals.approval(of: listing.deviceId),
              approval.covers(registrationId: listing.registrationId)
        else { return false }
        let address = address(of: listing.deviceId)
        guard try cipher.remoteRegistrationId(of: address) == listing.registrationId else { return true }
        return try cipher.remoteIdentity(of: address) == approval.identityKey
    }

    /// La clé publique de la génération annoncée : celle de la session courante
    /// si elle vise cette génération, sinon celle d'un bundle. Aucune session
    /// n'est ouverte ni effacée ici (une session saine perdue, ce sont des
    /// messages en vol perdus).
    private func currentIdentity(of listing: E2EEDeviceListing) async throws -> Data {
        let address = address(of: listing.deviceId)
        if try cipher.remoteRegistrationId(of: address) == listing.registrationId, let known = try cipher.remoteIdentity(of: address) {
            return known
        }
        let bundles = try await directory.bundles(userId: local.device.userId, deviceIds: [listing.deviceId]).devices
        guard let bundle = bundles.first(where: { $0.deviceId == listing.deviceId && $0.registrationId == listing.registrationId }),
              let identityKey = Data(base64Encoded: bundle.identityKey)
        else { throw E2EEOwnDeviceLinkingError.unknownDevice(listing.deviceId) }
        return identityKey
    }

    private func fingerprint(towards deviceId: UInt32, identityKey: Data) throws -> Fingerprint {
        let userId = local.device.userId
        return try E2EEFingerprint.between(
            local: (E2EEFingerprint.ownDeviceIdentifier(userId: userId, deviceId: local.device.deviceId), local.identity.keyPair.publicKey),
            remote: (E2EEFingerprint.ownDeviceIdentifier(userId: userId, deviceId: deviceId), try PublicKey(identityKey))
        )
    }
}
