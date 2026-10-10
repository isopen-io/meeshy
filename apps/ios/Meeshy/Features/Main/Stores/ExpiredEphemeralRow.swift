import Foundation
import MeeshySDK

/// **Un éphémère mort ne se publie plus au fil** (#8352).
///
/// Le fil rend les lignes de `MessageStore` (GRDB), pas `ConversationViewModel
/// .messages` : un éphémère échu — mort gravée au registre (flamme-œil
/// consommée, `message:expired`) ou échéance passée pendant que l'app dormait —
/// que la base ou le réseau RESSERT (l'upsert réécrit `deletedAt` depuis le
/// serveur) revenait dans les quatre modes. Les Bulles le masquaient
/// (`isExpired` ⇒ `EmptyView`), Focal, Script et la Rivière le rendaient, et
/// une flamme-œil consommée reparaissait en « Message supprimé ».
///
/// La question se pose ici, en LECTURE seule : aucune réception n'est stampée
/// (une ligne à moi n'a pas de réception, donc pas d'horloge locale).
enum ExpiredEphemeralRow {

    static func isGone(_ record: MessageRecord,
                       ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
                       now: Date = Date()) -> Bool {
        isGone(id: record.serverId ?? record.localId, flags: MessageEffectFlags(rawValue: record.effectFlags),
               expiresAt: record.expiresAt, ephemeralDuration: record.ephemeralDuration, ledger: ledger, now: now)
    }

    static func isGone(id: String, flags: MessageEffectFlags, expiresAt: Date?, ephemeralDuration: Int?,
                       ledger: EphemeralReceiptRecording, now: Date) -> Bool {
        guard flags.contains(.ephemeral) || expiresAt != nil || (ephemeralDuration ?? 0) > 0 else { return false }
        let death = ledger.destruction(of: id)
        return MessageProtectionDescriptor.resolve(
            flags: flags,
            servedExpiresAt: death.map { min($0, now) } ?? expiresAt,
            ephemeralDuration: ephemeralDuration,
            localReceivedAt: death == nil ? ledger.firstReception(of: id) : nil,
            now: now
        ).isExpired
    }
}

/// **Ce que le rattrapage depuis le cache a le droit de remettre en base** (#7552).
///
/// `observeSync` recopie dans GRDB les messages que le cache tient et que le
/// fil n'a pas. Or un éphémère mort n'est PLUS au fil, par construction — et
/// `deleteExpiredEphemeral` l'a effacé de la base : il revenait comme « nouveau »,
/// réinséré sans drapeau, sans durée ni échéance, c'est-à-dire en message
/// ORDINAIRE que plus aucun balayage ne pouvait retirer. Un mort ne remonte
/// pas ; un vivant remonte avec sa protection.
enum CachedThreadSurfacing {

    static func rows(_ cached: [Message],
                     present: Set<String>,
                     ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
                     now: Date = Date()) -> [MessagePersistenceActor.IncomingMessageData] {
        cached
            .filter { !present.contains($0.id) }
            .filter { message in
                !ExpiredEphemeralRow.isGone(id: message.id, flags: message.protectionFlags,
                                            expiresAt: message.expiresAt,
                                            ephemeralDuration: message.effects.ephemeralDuration,
                                            ledger: ledger, now: now)
            }
            .map { message in
                MessagePersistenceActor.IncomingMessageData(
                    id: message.id,
                    conversationId: message.conversationId,
                    senderId: message.senderId,
                    content: message.content.isEmpty ? nil : message.content,
                    createdAt: message.createdAt,
                    computedState: .delivered,
                    messageSource: message.messageSource.rawValue,
                    messageType: message.messageType.rawValue,
                    expiresAt: message.expiresAt,
                    effectFlags: message.protectionFlags.rawValue,
                    ephemeralDuration: message.effects.ephemeralDuration
                )
            }
    }
}
