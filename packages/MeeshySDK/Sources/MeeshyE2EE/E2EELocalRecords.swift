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
    /// Un contenu d'une version que cet appareil ne lit pas encore, à SA place
    /// (conversation, auteur) : le clair est gardé tel quel, pour la version de
    /// Meeshy qui saura le lire — l'enveloppe, elle, est acquittée et effacée.
    case newerFormat(Data, senderUserId: String)
    case undecryptable
}

extension E2EEPlaintextEntry: Codable {
    private enum CodingKeys: String, CodingKey { case state, content, sender, raw }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .state) {
        case "readable":
            self = .readable(
                try container.decode(E2EEContent.self, forKey: .content),
                senderUserId: try container.decode(String.self, forKey: .sender)
            )
        case "newer":
            let raw = try container.decode(Data.self, forKey: .raw)
            let sender = try container.decode(String.self, forKey: .sender)
            self = (try? E2EEContent.decoded(from: raw)).map { .readable($0, senderUserId: sender) } ?? .newerFormat(raw, senderUserId: sender)
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
        case .newerFormat(let raw, let senderUserId):
            try container.encode("newer", forKey: .state)
            try container.encode(raw, forKey: .raw)
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
    func approval(of deviceId: UInt32) throws -> E2EEOwnDeviceApproval?
}

/// Une approbation : la clé d'identité épinglée et, quand l'appairage l'a vue,
/// la génération de la place (`registrationId`). Une place reprise par une
/// autre installation n'hérite jamais de l'approbation (#12543).
public struct E2EEOwnDeviceApproval: Codable, Equatable, Sendable {
    public let identityKey: Data
    public let registrationId: UInt32?

    public init(identityKey: Data, registrationId: UInt32?) {
        self.identityKey = identityKey
        self.registrationId = registrationId
    }

    public func covers(registrationId announced: UInt32) -> Bool {
        registrationId.map { $0 == announced } ?? true
    }
}

public final class E2EEOwnDeviceApprovals: E2EEOwnDeviceApprovalProviding {
    private let vault: any E2EERecordVaultProviding

    public init(vault: any E2EERecordVaultProviding) {
        self.vault = vault
    }

    public func approvedIdentity(of deviceId: UInt32) throws -> Data? {
        try approval(of: deviceId)?.identityKey
    }

    public func approval(of deviceId: UInt32) throws -> E2EEOwnDeviceApproval? {
        try vault.read { try Self.approval(deviceId, in: $0) }
    }

    public func approve(deviceId: UInt32, identityKey: Data, registrationId: UInt32? = nil) throws {
        let record = try JSONEncoder().encode(E2EEOwnDeviceApproval(identityKey: identityKey, registrationId: registrationId))
        try vault.write { try $0.save(record, as: .approvedOwnDevice, String(deviceId)) }
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
        try approval(deviceId, in: transaction)?.identityKey
    }

    static func approval(_ deviceId: UInt32, in transaction: any E2EERecordTransaction) throws -> E2EEOwnDeviceApproval? {
        try transaction.load(.approvedOwnDevice, String(deviceId)).map { try JSONDecoder().decode(E2EEOwnDeviceApproval.self, from: $0) }
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
