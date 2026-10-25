import Foundation
import LibSignalClient
import MeeshySDK
import os

/// Un message ouvert sur cet appareil.
public struct E2EEOpenedMessage: Equatable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let senderUserId: String
    public let senderDeviceId: UInt32
    public let content: E2EEContent

    public init(messageId: String, conversationId: String, senderUserId: String, senderDeviceId: UInt32, content: E2EEContent) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.senderUserId = senderUserId
        self.senderDeviceId = senderDeviceId
        self.content = content
    }
}

public enum E2EEOpenError: Error, Equatable {
    /// L'enveloppe se dit envoyée par un de mes appareils que je n'ai pas (ou
    /// plus, ou pas sous cette clé) approuvé : elle attend, elle ne se juge pas.
    case unapprovedOwnDevice
}

/// Ce que devient une enveloppe reçue.
public enum E2EEOpenOutcome: Equatable, Sendable {
    case opened(E2EEOpenedMessage)
    /// Chiffrée pour une autre génération de ma place (#12592) : écartée, jamais ouverte.
    case notForThisDevice(envelopeId: String)
    /// La base ou le verrou ont refusé (suspension, base occupée) : rien n'a
    /// été décidé, l'enveloppe reste sur le serveur et se rouvrira au rattrapage.
    case deferred(envelopeId: String)
    /// libsignal l'a refusée (rejeu, session inconnue, version future) : la
    /// ligne locale le dit, rien ne repart en clair, aucun renvoi n'est demandé.
    case undecryptable(messageId: String, conversationId: String)

    public var messageId: String? {
        switch self {
        case .opened(let message): message.messageId
        case .undecryptable(let messageId, _): messageId
        case .notForThisDevice, .deferred: nil
        }
    }

    public var conversationId: String? {
        switch self {
        case .opened(let message): message.conversationId
        case .undecryptable(_, let conversationId): conversationId
        case .notForThisDevice, .deferred: nil
        }
    }
}

/// L'ouverture des enveloppes de CET appareil (spec § 4.1 et § 4.3), par la
/// socket ou par le rattrapage `GET /e2ee/envelopes`. Le clair est rangé dans
/// la base scellée DANS la transaction du déchiffrement, puis l'enveloppe est
/// acquittée — effacée du serveur. Une enveloppe déjà ouverte (la socket et le
/// rattrapage se croisent) n'est pas redéchiffrée : un second déchiffrement
/// échouerait (clé de message consommée) et effacerait le clair.
public protocol E2EEEnvelopeOpening: Sendable {
    func open(_ envelope: E2EEServedEnvelope) -> E2EEOpenOutcome
    /// Ouvre puis acquitte une enveloppe reçue en temps réel.
    func receive(_ envelope: E2EEServedEnvelope) async -> E2EEOpenOutcome
    /// Relit toutes les enveloppes en attente, les ouvre et les acquitte.
    func catchUp() async throws -> [E2EEOpenOutcome]
}

public final class E2EEEnvelopeOpener: E2EEEnvelopeOpening {
    public static let pageSize = 100

    private let local: E2EELocalDevice
    private let cipher: any E2EESessionCipherProviding
    private let plaintexts: any E2EEPlaintextStoring
    private let directory: any E2EEDirectoryClientProviding
    private let approvals: any E2EEOwnDeviceApprovalProviding
    private let logger = MeeshyLog.logger(.e2ee, subsystem: .sdk)

    public init(
        local: E2EELocalDevice,
        cipher: any E2EESessionCipherProviding,
        plaintexts: any E2EEPlaintextStoring,
        directory: any E2EEDirectoryClientProviding,
        approvals: any E2EEOwnDeviceApprovalProviding
    ) {
        self.local = local
        self.cipher = cipher
        self.plaintexts = plaintexts
        self.directory = directory
        self.approvals = approvals
    }

    public func open(_ envelope: E2EEServedEnvelope) -> E2EEOpenOutcome {
        guard envelope.isAddressed(to: local.registrationId) else { return .notForThisDevice(envelopeId: envelope.id) }
        if let known = try? plaintexts.entry(for: envelope.messageId) {
            return outcome(of: known, envelope)
        }
        let sender = E2EEDeviceAddress(userId: envelope.senderUserId, deviceId: envelope.senderDeviceId)
        // Un de mes appareils que je n'ai pas (encore) approuvé : l'enveloppe
        // reste au serveur, NON déchiffrée (le ratchet n'avance pas), et
        // s'ouvrira au rattrapage qui suit l'approbation (spec § 3.5). Sans
        // cela, ce que mon iPhone écrit entre les deux sens de l'appairage se
        // perdait sur le Mac. Le serveur la balaie au bout de 30 jours.
        if sender.userId == local.userId, (try? approvals.approvedIdentity(of: sender.deviceId)) == .some(nil) {
            return .deferred(envelopeId: envelope.id)
        }
        do {
            guard let body = Data(base64Encoded: envelope.body) else { throw E2EESessionCipherError.unknownMessageType(envelope.type) }
            let entry = try cipher.decrypt(E2EECiphertext(type: envelope.type, body: body), from: sender) { plaintext, transaction in
                // L'épingle se relit DANS la transaction : une révocation ou une
                // réapprobation concurrente ne s'intercale pas. Une clé qui n'est
                // pas l'épinglée annule la transaction (le ratchet n'avance pas) et
                // l'enveloppe attend : c'est le cas d'une place reprise par une
                // réinstallation que je n'ai pas encore réapprouvée.
                if sender.userId == local.userId {
                    let pinned = try E2EEOwnDeviceApprovals.pinned(sender.deviceId, in: transaction)
                    guard let pinned, try transaction.load(.remoteIdentity, "\(sender.userId).\(sender.deviceId)") == pinned else {
                        throw E2EEOpenError.unapprovedOwnDevice
                    }
                }
                let opened = try Self.entry(of: plaintext, in: envelope)
                try E2EEPlaintextRecords.save(opened, for: envelope.messageId, in: transaction)
                return opened
            }
            return outcome(of: entry, envelope)
        } catch {
            // La socket et le rattrapage peuvent ouvrir la même enveloppe en même
            // temps : le verrou les sérialise, et le second échoue (clé de message
            // consommée) APRÈS que le premier a rangé le clair. Il le relit.
            if let known = try? plaintexts.entry(for: envelope.messageId) { return outcome(of: known, envelope) }
            if error as? E2EEOpenError == .unapprovedOwnDevice { return .deferred(envelopeId: envelope.id) }
            guard Self.isVerdict(error) else {
                logger.warning("e2ee envelope deferred id=\(envelope.id, privacy: .public): storage refused")
                return .deferred(envelopeId: envelope.id)
            }
            logger.warning("e2ee envelope undecryptable id=\(envelope.id, privacy: .public) type=\(envelope.type, privacy: .public)")
            try? plaintexts.save(.undecryptable, for: envelope.messageId)
            return outcome(of: .undecryptable, envelope)
        }
    }

    /// Le clair, à SA place : même conversation, même auteur que l'expéditeur
    /// que libsignal authentifie. Un contenu d'une version future n'est pas lu,
    /// mais son en-tête (`E2EEContentHeader`, stable d'une version à l'autre) est
    /// jugé de même avant que son clair soit gardé.
    static func entry(of plaintext: Data, in envelope: E2EEServedEnvelope) throws -> E2EEPlaintextEntry {
        do {
            let content = try E2EEContent.decoded(from: plaintext)
            try place(conversationId: content.conversationId, authored: content.isAuthored(by: envelope.senderUserId, deviceId: envelope.senderDeviceId), envelope)
            return .readable(content, senderUserId: envelope.senderUserId)
        } catch E2EEContentError.unsupportedVersion(let version) where version > E2EEContent.currentVersion {
            let header = try JSONDecoder().decode(E2EEContentHeader.self, from: plaintext)
            try place(conversationId: header.conversationId, authored: header.isAuthored(by: envelope.senderUserId, deviceId: envelope.senderDeviceId), envelope)
            return .newerFormat(plaintext, senderUserId: envelope.senderUserId)
        }
    }

    private static func place(conversationId: String?, authored: Bool, _ envelope: E2EEServedEnvelope) throws {
        guard conversationId == envelope.conversationId else { throw E2EEContentError.misattributed }
        guard authored else { throw E2EEContentError.misattributedAuthor }
    }

    /// Une erreur qui JUGE l'enveloppe (libsignal la refuse, son contenu est
    /// illisible ou mal placé) — par opposition à la base ou au verrou qui
    /// refusent « pas maintenant ». Seul un verdict efface l'enveloppe : un
    /// refus de stockage acquitté perdrait le message à jamais.
    static func isVerdict(_ error: any Error) -> Bool {
        switch error {
        case is SignalError, is E2EEContentError, is E2EEOpenError, is E2EESessionCipherError, is DecodingError: true
        default: false
        }
    }

    public func receive(_ envelope: E2EEServedEnvelope) async -> E2EEOpenOutcome {
        let outcome = open(envelope)
        await acknowledge([(envelope, outcome)])
        return outcome
    }

    public func catchUp() async throws -> [E2EEOpenOutcome] {
        var cursor: String?
        var outcomes: [E2EEOpenOutcome] = []
        repeat {
            let page = try await directory.envelopes(after: cursor, limit: Self.pageSize)
            let opened = page.envelopes.map { ($0, open($0)) }
            await acknowledge(opened)
            outcomes += opened.map(\.1)
            cursor = page.envelopes.isEmpty ? nil : page.nextCursor
        } while cursor != nil
        return outcomes
    }

    /// Une enveloppe ouverte, ou définitivement illisible, s'efface du serveur ;
    /// celle d'une autre génération reste, pour le balayage de 30 jours.
    private func acknowledge(_ opened: [(E2EEServedEnvelope, E2EEOpenOutcome)]) async {
        let ids = opened.compactMap { envelope, outcome -> String? in
            switch outcome {
            case .notForThisDevice, .deferred: nil
            case .opened, .undecryptable: envelope.id
            }
        }
        guard !ids.isEmpty else { return }
        do {
            _ = try await directory.acknowledge(envelopeIds: ids)
        } catch {
            logger.warning("e2ee envelope ack failed count=\(ids.count, privacy: .public); retried at the next catch-up")
        }
    }

    private func outcome(of entry: E2EEPlaintextEntry, _ envelope: E2EEServedEnvelope) -> E2EEOpenOutcome {
        switch entry {
        case .readable(let content, let senderUserId):
            return .opened(E2EEOpenedMessage(
                messageId: envelope.messageId, conversationId: envelope.conversationId,
                senderUserId: senderUserId, senderDeviceId: envelope.senderDeviceId, content: content
            ))
        case .undecryptable, .newerFormat:
            return .undecryptable(messageId: envelope.messageId, conversationId: envelope.conversationId)
        }
    }
}
