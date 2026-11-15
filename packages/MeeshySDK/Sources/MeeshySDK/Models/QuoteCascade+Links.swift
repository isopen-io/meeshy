import Foundation

// MARK: - L'échéance de chaque maillon POUR CET APPAREIL (#10433)

/// Ce que la passerelle ne peut pas savoir hors ligne, et que la loi pure
/// `QuoteCascade` reçoit : quand chaque maillon meurt chez CE lecteur. Lu, jamais
/// écrit — aucune réception n'est stampée ici (même discipline que
/// `ExpiredEphemeralRow`) : une ligne qu'on n'a pas projetée n'a pas été reçue.
public extension QuoteCascade {

    /// L'échéance PROPRE d'un message chez ce lecteur — la règle de
    /// `MeeshyMessage.protection` en lecture seule : une mort gravée au registre
    /// l'emporte (jamais après `now`), sinon la plus proche de l'échéance
    /// servie et de la réception locale plus la durée. Une flamme-œil non
    /// consommée, un éphémère pas encore reçu, l'envoi de l'expéditeur (qui n'a
    /// pas de réception locale) n'ont pas d'échéance.
    static func ownDeath(
        id: String,
        flags: MessageEffectFlags,
        expiresAt: Date?,
        ephemeralDuration: Int?,
        ledger: EphemeralReceiptRecording,
        now: Date
    ) -> Date? {
        guard flags.contains(.ephemeral) || expiresAt != nil || (ephemeralDuration ?? 0) > 0 else { return nil }
        if let destroyedAt = ledger.destruction(of: id) { return min(destroyedAt, now) }
        let localDeadline: Date? = {
            guard let ephemeralDuration, ephemeralDuration > 0,
                  let receivedAt = ledger.firstReception(of: id) else { return nil }
            return receivedAt.addingTimeInterval(TimeInterval(ephemeralDuration))
        }()
        return inheritedExpiresAt([expiresAt, localDeadline])
    }

    /// Le maillon d'un message du fil.
    static func link(for message: MeeshyMessage, ledger: EphemeralReceiptRecording, now: Date) -> Link {
        let quote: ReplyReference? = message.replyTo.flatMap { reference -> ReplyReference? in
            reference.isStoryReply || reference.messageId.isEmpty ? nil : reference
        }
        return Link(
            id: message.id,
            quotedId: quote?.messageId ?? message.replyToId,
            ownDeath: ownDeath(
                id: message.id, flags: message.protectionFlags, expiresAt: message.expiresAt,
                ephemeralDuration: message.effects.ephemeralDuration, ledger: ledger, now: now
            ),
            embeddedQuoteDeath: quote.flatMap { quoted in embeddedDeath(of: quoted, destruction: { ledger.destruction(of: $0) }) }
        )
    }

    /// Le maillon d'une ligne GRDB. La citation gravée (`replyToJson`) n'est
    /// décodée que si elle PEUT porter une échéance — sans quoi chaque
    /// publication du fil décoderait chaque réponse pour rien.
    static func link(for record: MessageRecord, ledger: EphemeralReceiptRecording, now: Date) -> Link {
        let id = record.serverId ?? record.localId
        return Link(
            id: id,
            quotedId: record.replyToId,
            ownDeath: ownDeath(
                id: id, flags: MessageEffectFlags(rawValue: record.effectFlags), expiresAt: record.expiresAt,
                ephemeralDuration: record.ephemeralDuration, ledger: ledger, now: now
            ),
            embeddedQuoteDeath: embeddedQuote(of: record).flatMap { quoted in
                embeddedDeath(of: quoted, destruction: { ledger.destruction(of: $0) })
            }
        )
    }

    private static let deathMarkers: [Data] = ["quotedExpiresAt", "-flame"].map { Data($0.utf8) }

    private static func embeddedQuote(of record: MessageRecord) -> ReplyReference? {
        guard record.replyToId != nil, let blob = record.replyToJson,
              deathMarkers.contains(where: { blob.range(of: $0) != nil }) else { return nil }
        return try? JSONDecoder().decode(ReplyReference.self, from: blob)
    }
}

// MARK: - Le fil où se lisent les citations

public extension QuoteCascade {

    /// Les messages d'un fil, par identifiant — vide (et gratuit) quand rien
    /// n'y cite rien. Chaque maillon est construit À LA DEMANDE.
    struct MessageThread {
        private let rows: [String: MeeshyMessage]
        private let ledger: EphemeralReceiptRecording
        private let now: Date

        public init(_ messages: [MeeshyMessage], ledger: EphemeralReceiptRecording, now: Date) {
            self.ledger = ledger
            self.now = now
            guard messages.contains(where: { $0.replyToId != nil || $0.replyTo != nil }) else {
                self.rows = [:]
                return
            }
            self.rows = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        }

        /// L'échéance que `message` hérite de ce qu'il cite, ou `nil`.
        public func inheritedDeath(of message: MeeshyMessage) -> Date? {
            guard message.replyToId != nil || message.replyTo != nil else { return nil }
            return QuoteCascade.inheritedDeath(of: QuoteCascade.link(for: message, ledger: ledger, now: now)) { id in
                rows[id].map { QuoteCascade.link(for: $0, ledger: ledger, now: now) }
            }
        }
    }

    /// Les lignes GRDB d'un fil, par identifiant local ET serveur — une réponse
    /// cite l'id serveur, la ligne d'un envoi d'ici peut encore porter son id
    /// optimiste.
    struct RecordThread {
        private let rows: [String: MessageRecord]
        private let ledger: EphemeralReceiptRecording
        private let now: Date

        public init(_ records: [MessageRecord], ledger: EphemeralReceiptRecording, now: Date) {
            self.ledger = ledger
            self.now = now
            guard records.contains(where: { $0.replyToId != nil }) else {
                self.rows = [:]
                return
            }
            var rows: [String: MessageRecord] = [:]
            for record in records {
                if rows[record.localId] == nil { rows[record.localId] = record }
                if let serverId = record.serverId, rows[serverId] == nil { rows[serverId] = record }
            }
            self.rows = rows
        }

        /// L'échéance que `record` hérite de ce qu'il cite, ou `nil`.
        public func inheritedDeath(of record: MessageRecord) -> Date? {
            guard record.replyToId != nil else { return nil }
            return QuoteCascade.inheritedDeath(of: QuoteCascade.link(for: record, ledger: ledger, now: now)) { id in
                rows[id].map { QuoteCascade.link(for: $0, ledger: ledger, now: now) }
            }
        }
    }
}
