import Foundation
import MeeshySDK

/// Ce qu'un envoi libsignal porte sur le fil (spec § 4.3) : une enveloppe par
/// appareil destinataire, l'appareil émetteur, et ceux de MES appareils que je
/// n'ai pas approuvés (§ 3.5) — que la passerelle exclut de la comparaison
/// Sesame sans jamais leur remettre de copie.
public struct E2EESealedMessage: Equatable, Sendable {
    public let senderDeviceId: UInt32
    public let envelopes: [E2EEOutgoingEnvelope]
    public let unapprovedOwnDevices: [UInt32]

    public init(senderDeviceId: UInt32, envelopes: [E2EEOutgoingEnvelope], unapprovedOwnDevices: [UInt32]) {
        self.senderDeviceId = senderDeviceId
        self.envelopes = envelopes
        self.unapprovedOwnDevices = unapprovedOwnDevices
    }
}

public enum E2EESealError: Error, Equatable {
    /// Le correspondant n'a aucun appareil enrôlé : il n'a pas de version de
    /// Meeshy qui chiffre. Rien ne part, rien ne part en clair.
    case recipientHasNoDevice(userId: String)
    /// L'annuaire a refusé la liste d'appareils plus de fois que Sesame ne le
    /// justifie : la liste change sous nos pieds, ou le serveur ment.
    case devicesMismatchUnresolved
}

/// Le chiffrement d'un message pour CHAQUE appareil de la conversation
/// directe (Sesame, M. Marlinspike et T. Perrin, rév. 2, § 3) : les appareils
/// actifs du correspondant, plus mes autres appareils approuvés. Une session
/// manquante ou périmée s'ouvre depuis le bundle de l'appareil (PQXDH) ; un 409
/// `E2EE_DEVICES_MISMATCH` efface les sessions périmées et rechiffre.
///
/// Modèle de menace : serveur compromis. Il ne reçoit que des chiffrés ; il
/// peut annoncer un appareil de trop sur le compte du CORRESPONDANT (TOFU,
/// jusqu'à la vérification du numéro de sécurité, #12520), jamais sur le mien.
public protocol E2EEMessageSealing: Sendable {
    func seal(_ content: E2EEContent, to peerUserId: String) async throws -> E2EESealedMessage
    /// Scelle, remet par `deliver`, et résout jusqu'à `maxAttempts` refus Sesame.
    func sealAndDeliver<T: Sendable>(
        _ content: E2EEContent,
        to peerUserId: String,
        deliver: @concurrent @Sendable (E2EESealedMessage) async throws -> T
    ) async throws -> T
}

public final class E2EEMessageSealer: E2EEMessageSealing {
    public static let maxAttempts = 3

    private let local: E2EELocalDevice
    private let cipher: any E2EESessionCipherProviding
    private let directory: any E2EEDirectoryClientProviding
    private let approvals: any E2EEOwnDeviceApprovalProviding

    public init(
        local: E2EELocalDevice,
        cipher: any E2EESessionCipherProviding,
        directory: any E2EEDirectoryClientProviding,
        approvals: any E2EEOwnDeviceApprovalProviding
    ) {
        self.local = local
        self.cipher = cipher
        self.directory = directory
        self.approvals = approvals
    }

    public func seal(_ content: E2EEContent, to peerUserId: String) async throws -> E2EESealedMessage {
        let plaintext = try content.encoded()
        let peerTargets = try await targets(of: peerUserId)
        guard !peerTargets.isEmpty else { throw E2EESealError.recipientHasNoDevice(userId: peerUserId) }
        let own = try await ownTargets()
        let envelopes = try (peerTargets + own.approved).map { target in
            let ciphertext = try cipher.encrypt(plaintext, for: target.address)
            return E2EEOutgoingEnvelope(
                userId: target.address.userId, deviceId: target.address.deviceId,
                registrationId: target.registrationId, type: ciphertext.type, body: ciphertext.body.base64EncodedString()
            )
        }
        return E2EESealedMessage(senderDeviceId: local.deviceId, envelopes: envelopes, unapprovedOwnDevices: own.unapproved)
    }

    public func sealAndDeliver<T: Sendable>(
        _ content: E2EEContent,
        to peerUserId: String,
        deliver: @concurrent @Sendable (E2EESealedMessage) async throws -> T
    ) async throws -> T {
        for _ in 1...Self.maxAttempts {
            let sealed = try await seal(content, to: peerUserId)
            do {
                return try await deliver(sealed)
            } catch let mismatch as E2EEDevicesMismatch {
                try forget(mismatch.stale + mismatch.extra)
            }
        }
        throw E2EESealError.devicesMismatchUnresolved
    }

    /// Un appareil périmé ou en trop perd sa session : la prochaine passe la
    /// rouvrira depuis un bundle frais si l'annuaire l'annonce encore.
    private func forget(_ refs: [E2EEDeviceRef]) throws {
        try refs.forEach { try cipher.deleteSession(with: E2EEDeviceAddress(userId: $0.userId, deviceId: $0.deviceId)) }
    }

    private struct Target {
        let address: E2EEDeviceAddress
        let registrationId: UInt32
    }

    /// Les appareils actifs d'un utilisateur, chacun avec une session à jour.
    private func targets(of userId: String) async throws -> [Target] {
        let listed = try await directory.devices(userId: userId).devices
            .filter { !(userId == local.userId && $0.deviceId == local.deviceId) }
        return try await withSessions(userId: userId, listed)
    }

    /// Mes autres appareils : approuvés (ils reçoivent leur enveloppe) ou non.
    private func ownTargets() async throws -> (approved: [Target], unapproved: [UInt32]) {
        let others = try await directory.devices(userId: local.userId).devices.filter { $0.deviceId != local.deviceId }
        let pinned = try others.filter { try approvals.approvedIdentity(of: $0.deviceId) != nil }
        let opened = try await withSessions(userId: local.userId, pinned)
        let approved = try opened.filter { target in
            try cipher.remoteIdentity(of: target.address) == approvals.approvedIdentity(of: target.address.deviceId)
        }
        let approvedIds = Set(approved.map(\.address.deviceId))
        return (approved, others.map(\.deviceId).filter { !approvedIds.contains($0) })
    }

    /// Ouvre (PQXDH) la session de chaque appareil qui n'en a pas, ou dont la
    /// session vise une autre génération que celle de l'annuaire.
    private func withSessions(userId: String, _ listed: [E2EEDeviceListing]) async throws -> [Target] {
        let toOpen = try listed.filter { device in
            try cipher.remoteRegistrationId(of: E2EEDeviceAddress(userId: userId, deviceId: device.deviceId)) != device.registrationId
        }
        if !toOpen.isEmpty {
            let bundles = try await directory.bundles(userId: userId, deviceIds: toOpen.map(\.deviceId)).devices
            try bundles.forEach { bundle in
                try cipher.deleteSession(with: E2EEDeviceAddress(userId: userId, deviceId: bundle.deviceId))
                try cipher.startSession(with: bundle, of: userId)
            }
        }
        return try listed.compactMap { device in
            let address = E2EEDeviceAddress(userId: userId, deviceId: device.deviceId)
            guard let registrationId = try cipher.remoteRegistrationId(of: address) else { return nil }
            return Target(address: address, registrationId: registrationId)
        }
    }
}
