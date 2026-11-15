import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// Un appareil chiffré de MON compte, tel que l'écran « Mes appareils
/// chiffrés » le montre (#13009). La confiance vient de CET appareil seul — les
/// approbations de son coffre (spec § 3.5) ; la passerelle ne fournit que de
/// quoi nommer la ligne.
nonisolated struct EndToEndOwnDevice: Equatable, Sendable, Identifiable {
    enum Trust: Equatable, Sendable {
        case thisDevice
        /// Cet appareil a lu son code : il lui écrit et le lit.
        case approved
        /// Inscrit sur le compte, jamais approuvé ici (ou sous une autre clé).
        case pending
    }

    let deviceId: UInt32
    let registrationId: UInt32
    let platform: E2EEPlatform?
    let label: String?
    let enrolledAt: Date?
    let lastSeenAt: Date?
    let trust: Trust

    var id: UInt32 { deviceId }
    var isCurrent: Bool { trust == .thisDevice }

    /// Cet appareil d'abord, puis les autres dans l'ordre de l'annuaire. Une
    /// métadonnée ne s'attache qu'à la MÊME génération (numéro ET
    /// `registrationId`) : une place reprise ne garde pas le nom de l'ancienne.
    /// Le drapeau `current` servi n'est jamais lu : c'est cet appareil qui sait
    /// qui il est. Un appareil servi deux fois n'apparaît qu'une fois, et en
    /// attente : un doublon ne vaut pas approbation.
    static func list(current: E2EELocalDevice, others: [E2EEOwnDeviceStatus], details: [E2EEOwnDeviceDetails]) -> [EndToEndOwnDevice] {
        let named = { (deviceId: UInt32, registrationId: UInt32) in
            details.first { $0.deviceId == deviceId && $0.registrationId == registrationId }
        }
        let this = EndToEndOwnDevice(
            current.deviceId, current.registrationId, trust: .thisDevice,
            details: named(current.deviceId, current.registrationId)
        )
        let listed = others.filter { $0.deviceId != current.deviceId }
        let unique = listed.enumerated().filter { index, status in
            !listed[..<index].contains { $0.deviceId == status.deviceId }
        }.map(\.element)
        return [this] + unique.map { status in
            let servedTwice = listed.filter { $0.deviceId == status.deviceId }.count > 1
            return EndToEndOwnDevice(
                status.deviceId, status.registrationId, trust: status.approved && !servedTwice ? .approved : .pending,
                details: named(status.deviceId, status.registrationId)
            )
        }
    }

    private init(_ deviceId: UInt32, _ registrationId: UInt32, trust: Trust, details: E2EEOwnDeviceDetails?) {
        self.deviceId = deviceId
        self.registrationId = registrationId
        self.platform = details?.platform
        self.label = details?.label
        self.enrolledAt = details?.enrolledAt
        self.lastSeenAt = details?.lastSeenAt
        self.trust = trust
    }

    init(deviceId: UInt32, registrationId: UInt32, platform: E2EEPlatform?, label: String?, enrolledAt: Date?, lastSeenAt: Date?, trust: Trust) {
        self.deviceId = deviceId
        self.registrationId = registrationId
        self.platform = platform
        self.label = label
        self.enrolledAt = enrolledAt
        self.lastSeenAt = lastSeenAt
        self.trust = trust
    }
}

/// L'appairage de mes appareils, vu par l'écran (#13009). Rien n'est approuvé
/// sans `approve(_:as:)`, que seule la confirmation explicite de l'utilisateur
/// appelle ; une approbation relance le rattrapage, pour ouvrir les copies qui
/// attendaient cet appareil (spec § 3.5).
nonisolated protocol EndToEndOwnDeviceLinking: Sendable {
    func linkedDevices(of userId: String) async throws -> [EndToEndOwnDevice]
    func pairingCode(towards deviceId: UInt32, as userId: String) async throws -> E2EEPairingCode
    func candidate(matching payload: String, as userId: String) async throws -> E2EEPairingCandidate?
    func approve(_ candidate: E2EEPairingCandidate, as userId: String) async throws
    func revokeApproval(of deviceId: UInt32, as userId: String) async throws
    /// Retire l'appareil du COMPTE : son identité est révoquée par la passerelle.
    /// La génération AFFICHÉE est nommée : une place reprise depuis la liste
    /// lève `E2EEDeviceRetirementError.deviceChanged` et n'est pas retirée (#13036).
    func retire(deviceId: UInt32, registrationId: UInt32) async throws
}

extension EndToEndMessagingRuntime: EndToEndOwnDeviceLinking {
    func linkedDevices(of userId: String) async throws -> [EndToEndOwnDevice] {
        let device = try await ready(for: userId)
        let others = try await device.linking.ownDevices()
        return EndToEndOwnDevice.list(current: device.device, others: others, details: await Self.details(of: device))
    }

    func pairingCode(towards deviceId: UInt32, as userId: String) async throws -> E2EEPairingCode {
        try await ready(for: userId).linking.pairingCode(towards: deviceId)
    }

    func candidate(matching payload: String, as userId: String) async throws -> E2EEPairingCandidate? {
        try await ready(for: userId).linking.candidate(matching: payload)
    }

    func approve(_ candidate: E2EEPairingCandidate, as userId: String) async throws {
        try await ready(for: userId).linking.approve(candidate)
        Logger.e2ee.info("e2ee own device approved device=\(candidate.deviceId, privacy: .public)")
        await catchUp(as: userId)
    }

    func revokeApproval(of deviceId: UInt32, as userId: String) async throws {
        try await ready(for: userId).linking.revoke(deviceId: deviceId)
        Logger.e2ee.info("e2ee own device approval revoked device=\(deviceId, privacy: .public)")
    }

    /// Une passerelle qui ne sert pas encore `GET /e2ee/devices` (404) laisse
    /// des lignes sans nom, jamais une liste vide : la liste vient de l'annuaire.
    private static func details(of device: EndToEndReadyDevice) async -> [E2EEOwnDeviceDetails] {
        do {
            return try await device.ownDeviceDetails()
        } catch {
            Logger.e2ee.warning("e2ee own device details unavailable: \(String(describing: type(of: error)), privacy: .public)")
            return []
        }
    }
}

/// L'appairage d'une installation qui n'en a pas (doubles de test) : tout appel
/// échoue, rien ne s'approuve.
nonisolated struct UnavailableOwnDeviceLinking: E2EEOwnDeviceLinkingProviding {
    func ownDevices() async throws -> [E2EEOwnDeviceStatus] { throw CocoaError(.featureUnsupported) }
    func pairingCode(towards deviceId: UInt32) async throws -> E2EEPairingCode { throw CocoaError(.featureUnsupported) }
    func candidate(matching qrPayload: String) async throws -> E2EEPairingCandidate? { throw CocoaError(.featureUnsupported) }
    func approve(_ candidate: E2EEPairingCandidate) throws { throw CocoaError(.featureUnsupported) }
    func revoke(deviceId: UInt32) throws { throw CocoaError(.featureUnsupported) }
}
