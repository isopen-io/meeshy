import Foundation

/// Un signal reçu sur cet appareil, tel que libsignal l'a AUTHENTIFIÉ : son
/// expéditeur est l'appareil de la session qui l'a chiffré, pas le nom que la
/// passerelle met à côté.
public struct E2EEReceivedSignal: Codable, Equatable, Sendable {
    /// L'identifiant opaque que la passerelle a donné au signal (`messageId` de l'enveloppe).
    public let signalId: String
    public let conversationId: String
    public let senderUserId: String
    public let senderDeviceId: UInt32
    public let signal: E2EESignal
    /// Posé quand l'app l'a appliqué ou écarté : il ne se rejoue plus.
    public let settledAt: Int64?

    public init(signalId: String, conversationId: String, senderUserId: String, senderDeviceId: UInt32, signal: E2EESignal, settledAt: Int64? = nil) {
        self.signalId = signalId
        self.conversationId = conversationId
        self.senderUserId = senderUserId
        self.senderDeviceId = senderDeviceId
        self.signal = signal
        self.settledAt = settledAt
    }

    func settled(at date: Date) -> E2EEReceivedSignal {
        E2EEReceivedSignal(
            signalId: signalId, conversationId: conversationId, senderUserId: senderUserId, senderDeviceId: senderDeviceId,
            signal: signal, settledAt: Int64((date.timeIntervalSince1970 * 1000).rounded())
        )
    }
}

/// La boîte des signaux reçus (#13142), dans la base scellée. Un signal y est
/// rangé DANS la transaction de son déchiffrement : le ratchet n'avance jamais
/// sans que le signal soit gardé, et un arrêt de l'app entre l'ouverture et
/// l'application ne le perd pas. L'app l'applique, puis le RÈGLE ; réglé, il
/// reste connu le temps qu'une copie de la même enveloppe (socket et
/// rattrapage qui se croisent) ne le rejoue pas, puis il s'efface.
public protocol E2EESignalInboxProviding: Sendable {
    func entry(for signalId: String) throws -> E2EEReceivedSignal?
    /// Les signaux non réglés, dans l'ordre de la passerelle (identifiants croissants).
    func pending() throws -> [E2EEReceivedSignal]
    func settle(_ signalIds: [String], at date: Date) throws
}

enum E2EESignalRecords {
    static func load(_ signalId: String, in transaction: any E2EERecordTransaction) throws -> E2EEReceivedSignal? {
        try transaction.load(.signal, signalId).map { try JSONDecoder().decode(E2EEReceivedSignal.self, from: $0) }
    }

    static func save(_ received: E2EEReceivedSignal, in transaction: any E2EERecordTransaction) throws {
        try transaction.save(try JSONEncoder().encode(received), as: .signal, received.signalId)
    }
}

public final class E2EESignalInbox: E2EESignalInboxProviding {
    /// Un signal réglé reste connu la rétention des enveloppes de la passerelle
    /// (30 jours) plus une semaine de marge d'horloge, comme un effacement (#13001).
    public static let settledRetention: TimeInterval = 37 * 86_400

    private let vault: any E2EERecordVaultProviding
    private let owner: String?

    public init(vault: any E2EERecordVaultProviding, owner: String? = nil) {
        self.vault = vault
        self.owner = owner
    }

    public func entry(for signalId: String) throws -> E2EEReceivedSignal? {
        try vault.read { transaction in
            guard try serves(in: transaction) else { return nil }
            return try E2EESignalRecords.load(signalId, in: transaction)
        }
    }

    public func pending() throws -> [E2EEReceivedSignal] {
        try vault.read { transaction in
            guard try serves(in: transaction) else { return [] }
            return try transaction.keys(of: .signal)
                .compactMap { try E2EESignalRecords.load($0, in: transaction) }
                .filter { $0.settledAt == nil }
        }
    }

    public func settle(_ signalIds: [String], at date: Date) throws {
        let cutoff = Int64(((date.timeIntervalSince1970 - Self.settledRetention) * 1000).rounded())
        try vault.write { transaction in
            guard try serves(in: transaction) else { throw E2EEPlaintextVaultError.foreignAccount }
            for id in signalIds {
                guard let received = try E2EESignalRecords.load(id, in: transaction), received.settledAt == nil else { continue }
                try E2EESignalRecords.save(received.settled(at: date), in: transaction)
            }
            for key in try transaction.keys(of: .signal) {
                guard let settledAt = try E2EESignalRecords.load(key, in: transaction)?.settledAt, settledAt < cutoff else { continue }
                try transaction.remove(.signal, key)
            }
        }
    }

    private func serves(in transaction: any E2EERecordTransaction) throws -> Bool {
        guard let owner else { return true }
        return try E2EELocalEnrollmentRecord.load(in: transaction)?.userId == owner
    }
}
