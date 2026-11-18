import Foundation

/// **UNE seule fonction juge qu'un éphémère est mort** (#19437).
///
/// L'app tenait un éphémère pour mort selon l'échéance SERVIE, **ou** la réception locale plus la durée, **ou** la mort
/// gravée au registre (`ExpiredEphemeralRow`), alors que `MessageEnrichmentLaw` ne lisait que `expiresAt` : un éphémère
/// échu par la durée locale disparaissait du fil et gardait pourtant sa traduction, sa transcription et ses champs
/// voisins sur le disque. La loi et l'app appellent désormais ce site, et ne s'écartent plus.
public enum EphemeralExpiry {

    /// - Parameters:
    ///   - id: l'identifiant que le registre connaît (serveur, sinon local).
    ///   - ledger: le registre des réceptions et des morts, injectable pour les témoins.
    public static func isGone(
        id: String,
        flags: MessageEffectFlags,
        expiresAt: Date?,
        ephemeralDuration: Int?,
        ledger: EphemeralReceiptRecording,
        now: Date
    ) -> Bool {
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

    public static func isGone(
        _ record: MessageRecord,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
        now: Date = Date()
    ) -> Bool {
        isGone(
            id: record.serverId ?? record.localId,
            flags: MessageEffectFlags(rawValue: record.effectFlags),
            expiresAt: record.expiresAt,
            ephemeralDuration: record.ephemeralDuration,
            ledger: ledger,
            now: now
        )
    }

    public static func isGone(
        _ message: MeeshyMessage,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
        now: Date = Date()
    ) -> Bool {
        isGone(
            id: message.id,
            flags: message.protectionFlags,
            expiresAt: message.expiresAt,
            ephemeralDuration: message.effects.ephemeralDuration,
            ledger: ledger,
            now: now
        )
    }
}
