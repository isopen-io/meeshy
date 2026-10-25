import Foundation

// Ce que cet appareil garde de lui-même dans la base scellée, à côté des
// stores libsignal : le clair de ce qu'il a déchiffré ou envoyé, ses autres
// appareils approuvés, son enrôlement. Rien de tout cela ne part au serveur.

/// Ce que l'appareil sait d'un message chiffré : son clair, ou le fait qu'il
/// n'a pas pu l'ouvrir (spec § 4.1 : une ligne « un message n'a pas pu être
/// déchiffré », jamais un repli en clair ni une demande de renvoi).
public enum E2EEPlaintextEntry: Equatable, Sendable {
    /// Le clair, et l'auteur que libsignal a AUTHENTIFIÉ (la session de son
    /// appareil) — pas celui que le serveur annonce à côté du message.
    case readable(E2EEContent, senderUserId: String)
    case undecryptable
}

extension E2EEPlaintextEntry: Codable {
    private enum CodingKeys: String, CodingKey { case state, content, sender }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .state) {
        case "readable":
            self = .readable(
                try container.decode(E2EEContent.self, forKey: .content),
                senderUserId: try container.decode(String.self, forKey: .sender)
            )
        default: self = .undecryptable
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .readable(let content, let senderUserId):
            try container.encode("readable", forKey: .state)
            try container.encode(content, forKey: .content)
            try container.encode(senderUserId, forKey: .sender)
        case .undecryptable:
            try container.encode("undecryptable", forKey: .state)
        }
    }
}

/// Le clair local, par identifiant de message. Écrit dans la MÊME transaction
/// que le déchiffrement qui l'a produit (`E2EEPlaintextRecords`) : un ratchet
/// qui avance sans que son clair soit rangé perdrait le message à jamais.
public protocol E2EEPlaintextStoring: Sendable {
    func entry(for messageId: String) throws -> E2EEPlaintextEntry?
    func entries(for messageIds: [String]) throws -> [String: E2EEPlaintextEntry]
    func save(_ entry: E2EEPlaintextEntry, for messageId: String) throws
}

enum E2EEPlaintextRecords {
    static func load(_ messageId: String, in transaction: any E2EERecordTransaction) throws -> E2EEPlaintextEntry? {
        try transaction.load(.plaintext, messageId).map { try JSONDecoder().decode(E2EEPlaintextEntry.self, from: $0) }
    }

    static func save(_ entry: E2EEPlaintextEntry, for messageId: String, in transaction: any E2EERecordTransaction) throws {
        try transaction.save(try JSONEncoder().encode(entry), as: .plaintext, messageId)
    }
}

public final class E2EEPlaintextVault: E2EEPlaintextStoring {
    private let vault: any E2EERecordVaultProviding

    public init(vault: any E2EERecordVaultProviding) {
        self.vault = vault
    }

    public func entry(for messageId: String) throws -> E2EEPlaintextEntry? {
        try vault.read { try E2EEPlaintextRecords.load(messageId, in: $0) }
    }

    public func entries(for messageIds: [String]) throws -> [String: E2EEPlaintextEntry] {
        try vault.read { transaction in
            try messageIds.reduce(into: [String: E2EEPlaintextEntry]()) { found, id in
                if let entry = try E2EEPlaintextRecords.load(id, in: transaction) { found[id] = entry }
            }
        }
    }

    public func save(_ entry: E2EEPlaintextEntry, for messageId: String) throws {
        try vault.write { try E2EEPlaintextRecords.save(entry, for: messageId, in: $0) }
    }
}

/// Mes autres appareils que J'AI approuvés (spec § 3.5), avec la clé
/// d'identité épinglée à l'approbation. Un appareil que le serveur annonce sur
/// mon compte sans approbation locale ne reçoit RIEN : sans cela, un serveur
/// compromis ajouterait un « appareil » pour recevoir une copie de mes messages.
/// L'approbation elle-même (QR du `ScannableFingerprint`) : `E2EEOwnDeviceLinking` (#12976).
public protocol E2EEOwnDeviceApprovalProviding: Sendable {
    func approvedIdentity(of deviceId: UInt32) throws -> Data?
}

public final class E2EEOwnDeviceApprovals: E2EEOwnDeviceApprovalProviding {
    private let vault: any E2EERecordVaultProviding

    public init(vault: any E2EERecordVaultProviding) {
        self.vault = vault
    }

    public func approvedIdentity(of deviceId: UInt32) throws -> Data? {
        try vault.read { try $0.load(.approvedOwnDevice, String(deviceId)) }
    }

    public func approve(deviceId: UInt32, identityKey: Data) throws {
        try vault.write { try $0.save(identityKey, as: .approvedOwnDevice, String(deviceId)) }
    }

    public func revoke(deviceId: UInt32) throws {
        try vault.write { try $0.remove(.approvedOwnDevice, String(deviceId)) }
    }

    public func approvedDeviceIds() throws -> [UInt32] {
        try vault.read { try $0.keys(of: .approvedOwnDevice) }.compactMap(UInt32.init)
    }

    /// La clé épinglée, lue dans la transaction libsignal en cours : c'est là
    /// que `MeeshySignalProtocolStore.isTrustedIdentity` fait respecter
    /// l'approbation, pas dans une lecture séparée qu'un écrivain concurrent
    /// pourrait devancer.
    static func pinned(_ deviceId: UInt32, in transaction: any E2EERecordTransaction) throws -> Data? {
        try transaction.load(.approvedOwnDevice, String(deviceId))
    }
}

/// L'adresse de CET appareil telle que l'annuaire l'a enrôlé.
public struct E2EELocalDevice: Codable, Equatable, Sendable {
    public let userId: String
    public let deviceId: UInt32
    public let registrationId: UInt32

    public init(userId: String, deviceId: UInt32, registrationId: UInt32) {
        self.userId = userId
        self.deviceId = deviceId
        self.registrationId = registrationId
    }

    public var address: E2EEDeviceAddress { E2EEDeviceAddress(userId: userId, deviceId: deviceId) }
}

enum E2EELocalEnrollmentRecord {
    static let key = "current"

    static func load(in transaction: any E2EERecordTransaction) throws -> E2EELocalDevice? {
        try transaction.load(.localEnrollment, key).map { try JSONDecoder().decode(E2EELocalDevice.self, from: $0) }
    }

    static func save(_ device: E2EELocalDevice, in transaction: any E2EERecordTransaction) throws {
        try transaction.save(try JSONEncoder().encode(device), as: .localEnrollment, key)
    }
}
