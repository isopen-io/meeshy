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
    /// Un SIGNAL authentifié (#13142), rangé dans la boîte des signaux : l'app
    /// l'applique selon `E2EESignalAuthority`, puis le règle. Réglé, il revient
    /// tel quel (une copie croisée de la même enveloppe) et ne se rejoue pas.
    case signal(E2EEReceivedSignal)

    public var messageId: String? {
        switch self {
        case .opened(let message): message.messageId
        case .undecryptable(let messageId, _): messageId
        case .notForThisDevice, .deferred, .signal: nil
        }
    }

    public var conversationId: String? {
        switch self {
        case .opened(let message): message.conversationId
        case .undecryptable(_, let conversationId): conversationId
        case .signal(let received): received.conversationId
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
    private let signals: (any E2EESignalInboxProviding)?
    private let logger = MeeshyLog.logger(.e2ee, subsystem: .sdk)

    /// `signals` : la boîte des signaux, que l'ouvreur relit avant de
    /// déchiffrer une enveloppe déjà ouverte (#13142). Sans elle, un signal
    /// s'ouvre et se range quand même ; seule sa copie croisée se juge illisible.
    public init(
        local: E2EELocalDevice,
        cipher: any E2EESessionCipherProviding,
        plaintexts: any E2EEPlaintextStoring,
        directory: any E2EEDirectoryClientProviding,
        approvals: any E2EEOwnDeviceApprovalProviding,
        signals: (any E2EESignalInboxProviding)? = nil
    ) {
        self.local = local
        self.cipher = cipher
        self.plaintexts = plaintexts
        self.directory = directory
        self.approvals = approvals
        self.signals = signals
    }

    /// Ce que l'appareil sait déjà de cette enveloppe : un message rangé, ou un signal reçu.
    private func known(_ envelope: E2EEServedEnvelope) -> E2EEOpenOutcome? {
        if let entry = try? plaintexts.entry(for: envelope.messageId) { return outcome(of: entry, envelope) }
        if let received = try? signals?.entry(for: envelope.messageId) { return .signal(received) }
        return nil
    }

    public func open(_ envelope: E2EEServedEnvelope) -> E2EEOpenOutcome {
        guard envelope.isAddressed(to: local.registrationId) else { return .notForThisDevice(envelopeId: envelope.id) }
        if let known = known(envelope) { return known }
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
            let opened = try cipher.decrypt(E2EECiphertext(type: envelope.type, body: body), from: sender) { plaintext, transaction -> Opened in
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
                if E2EEPayloadKind.of(plaintext) == .signal {
                    return .signal(try Self.receivedSignal(plaintext, in: envelope, transaction: transaction))
                }
                let content = try E2EEContent.decoded(from: plaintext)
                guard content.belongs(to: envelope.conversationId) else { throw E2EEContentError.misattributed }
                guard content.isAuthored(by: envelope.senderUserId, deviceId: envelope.senderDeviceId) else {
                    throw E2EEContentError.misattributedAuthor
                }
                try E2EEPlaintextRecords.save(.readable(content, senderUserId: envelope.senderUserId), for: envelope.messageId, in: transaction)
                return .message(content)
            }
            switch opened {
            case .message(let content): return outcome(of: .readable(content, senderUserId: envelope.senderUserId), envelope)
            case .signal(let received): return .signal(received)
            }
        } catch {
            // La socket et le rattrapage peuvent ouvrir la même enveloppe en même
            // temps : le verrou les sérialise, et le second échoue (clé de message
            // consommée) APRÈS que le premier a rangé le clair. Il le relit.
            if let known = known(envelope) { return known }
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

    private enum Opened {
        case message(E2EEContent)
        case signal(E2EEReceivedSignal)
    }

    /// Un signal ne se range que s'il est à SA place : la conversation de
    /// l'enveloppe, et l'appareil que libsignal vient d'authentifier comme auteur.
    private static func receivedSignal(
        _ plaintext: Data, in envelope: E2EEServedEnvelope, transaction: any E2EERecordTransaction
    ) throws -> E2EEReceivedSignal {
        let signal = try E2EESignal.decoded(from: plaintext)
        guard signal.belongs(to: envelope.conversationId) else { throw E2EEContentError.misattributed }
        guard signal.isAuthored(by: envelope.senderUserId, deviceId: envelope.senderDeviceId) else {
            throw E2EEContentError.misattributedAuthor
        }
        let received = E2EEReceivedSignal(
            signalId: envelope.messageId, conversationId: envelope.conversationId,
            senderUserId: envelope.senderUserId, senderDeviceId: envelope.senderDeviceId, signal: signal
        )
        try E2EESignalRecords.save(received, in: transaction)
        return received
    }

    /// Une erreur qui JUGE l'enveloppe (libsignal la refuse, son contenu est
    /// illisible ou mal placé) — par opposition à la base ou au verrou qui
    /// refusent « pas maintenant ». Seul un verdict efface l'enveloppe : un
    /// refus de stockage acquitté perdrait le message à jamais.
    static func isVerdict(_ error: any Error) -> Bool {
        switch error {
        case is SignalError, is E2EEContentError, is E2EESignalError, is E2EEOpenError, is E2EESessionCipherError, is DecodingError: true
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
            case .opened, .undecryptable, .signal: envelope.id
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
        case .undecryptable:
            return .undecryptable(messageId: envelope.messageId, conversationId: envelope.conversationId)
        }
    }
}
