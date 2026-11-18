import Foundation
import GRDB

/// **Un enrichissement se garde sur l'appareil exactement tant que le contenu qu'il double s'y garde en clair**
/// (#18934) — la traduction d'un texte, la transcription d'un vocal, ses pistes traduites.
///
/// La passerelle sert les traductions AVEC le contenu et les retient AVEC lui : une vue unique déjà ouverte ne sert
/// « ni texte, ni traduction, ni pièce jointe » (`projectViewOnceForReader`, #7578), un éphémère échu ne sert plus que
/// sa bulle (#18556). L'appareil tient la même parité, et ses deux moitiés sont des écritures :
/// - **ce qui garde** : un message ordinaire, une vue unique pas encore ouverte, un éphémère vivant, un flouté. Leur
///   texte est déjà dans la même base, en clair, et le Prisme du lecteur a besoin de sa traduction — hors ligne, et
///   au moment où la vue unique s'ouvre. Les en priver ne protégerait rien que la ligne voisine ne garde déjà ;
/// - **ce qui ne garde rien** : un message chiffré de bout en bout (son clair ne vit que dans le coffre,
///   `EndToEndDiskPlaintextLaw`, #12999), une vue unique ouverte (#7579), un message supprimé ou un éphémère échu.
///   Leur contenu est effacé, et ce qui le doublait part avec lui (`erase(enrichmentsOf:in:)`), puis ne revient plus.
///
/// Écrivains : `MessageEnrichmentWriter` (le socket, conversation ouverte ou fermée), `APIMessageUpsert`
/// (`persistTranslations`, le REST) et le cache de fil (`ConversationSyncEngine.handleAttachmentUpdated`). La garde
/// `TranslationWriterCallSitesGuardTests` tient la liste des sites qui écrivent une traduction : un nouveau site doit
/// d'abord passer par cette loi.
///
/// **Effaceurs, et le contenu part avec ses enrichissements (#19437, #19305)** : `markDeleted` (suppression et
/// échéance), `markViewOnceOpened`, le REST qui apprend la transition (`enforce`, appelé par `APIMessageUpsert`), le
/// balayage unique de l'existant (`sweep`, une migration) et `deleteExpiredEphemeral`. Ce qui part à côté du texte
/// — pièces (nom de fichier, légende, vignette), lieu, autocollant, liens suivis — suit la même loi
/// (`MessageEnrichmentLaw+Erasure.swift`).
public enum MessageEnrichmentLaw {

    /// Le contenu se garde-t-il encore en clair dans la base ?
    ///
    /// `expired` vient de `EphemeralExpiry.isGone` : le SEUL juge de l'échéance, celui que l'app consulte pour retirer
    /// l'éphémère du fil (échéance servie, réception locale plus durée, mort gravée au registre).
    public static func keepsEnrichments(
        sealedEndToEnd: Bool, viewOnceOpenedAt: Date?, deletedAt: Date?, expired: Bool
    ) -> Bool {
        !sealedEndToEnd && viewOnceOpenedAt == nil && deletedAt == nil && !expired
    }

    public static func keepsEnrichments(
        of record: MessageRecord, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) -> Bool {
        keepsEnrichments(
            sealedEndToEnd: EndToEndDiskPlaintextLaw.sealsContent(isEncrypted: record.isEncrypted, encryptionMode: record.encryptionMode),
            viewOnceOpenedAt: record.viewOnceOpenedAt, deletedAt: record.deletedAt,
            expired: EphemeralExpiry.isGone(record, ledger: ledger, now: now)
        )
    }

    public static func keepsEnrichments(
        of message: MeeshyMessage, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) -> Bool {
        keepsEnrichments(
            sealedEndToEnd: EndToEndDiskPlaintextLaw.sealsContent(isEncrypted: message.isEncrypted, encryptionMode: message.encryptionMode),
            viewOnceOpenedAt: message.viewOnceOpenedAt, deletedAt: message.deletedAt,
            expired: EphemeralExpiry.isGone(message, ledger: ledger, now: now)
        )
    }

    /// Le contenu de la ligne est-il parti — vue unique ouverte, message supprimé, éphémère échu ? Alors ni son texte,
    /// ni ses pièces, ni son lieu, son autocollant ou ses liens suivis n'ont plus de raison de rester en clair.
    /// Un message chiffré de bout en bout n'en fait pas partie : son clair ne vit déjà que dans le coffre.
    public static func contentIsGone(
        of record: MessageRecord, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) -> Bool {
        record.viewOnceOpenedAt != nil || record.deletedAt != nil || EphemeralExpiry.isGone(record, ledger: ledger, now: now)
    }

    /// La ligne d'un message, par son identifiant local OU serveur : une traduction et une pièce enrichie portent
    /// l'identifiant SERVEUR, la ligne d'un message envoyé d'ici garde son identifiant optimiste.
    static func row(of messageId: String, in db: Database) throws -> MessageRecord? {
        try MessageRecord.filter(Column("localId") == messageId || Column("serverId") == messageId).fetchOne(db)
    }

    /// Le contenu de `record` vient d'être effacé : ses traductions, et les transcriptions et pistes traduites de ses
    /// pièces, partent avec lui. Une ligne déjà scellée (`attachmentsJson` vide) ne perd que ses traductions.
    ///
    /// Les pièces se relisent dans la BASE, jamais dans `record` : l'appelant l'a souvent vidée juste avant, et écrire
    /// les pièces d'un `record` périmé les ferait revenir.
    ///
    /// - Returns: `true` quand quelque chose est parti.
    @discardableResult
    static func erase(enrichmentsOf record: MessageRecord, in db: Database) throws -> Bool {
        let removed = try TranslationRecord
            .filter(Column("messageLocalId") == record.localId
                    || Column("messageServerId") == (record.serverId ?? record.localId))
            .deleteAll(db)
        guard let pieces = try MessageRecord.fetchOne(db, key: record.localId)?.attachmentsJson else { return removed > 0 }
        let bare = strippedOfEnrichments(pieces)
        guard bare != pieces else { return removed > 0 }
        try db.execute(
            sql: "UPDATE messages SET attachmentsJson = ? WHERE localId = ?",
            arguments: [bare, record.localId]
        )
        return true
    }

    /// Les pièces sans transcription ni piste traduite. Un blob illisible ne se garde pas : ce qu'on ne relit pas,
    /// on ne peut pas prouver qu'il ne transcrit rien.
    static func strippedOfEnrichments(_ pieces: Data) -> Data? {
        guard let decoded = try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: pieces) else { return nil }
        let bare = decoded.map { piece -> MeeshyMessageAttachment in
            var stripped = piece
            stripped.transcription = nil
            stripped.audioTranslations = nil
            return stripped
        }
        return try? JSONEncoder().encode(bare)
    }
}
