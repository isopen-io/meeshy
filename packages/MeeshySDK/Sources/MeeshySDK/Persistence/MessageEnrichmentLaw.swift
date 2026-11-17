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
/// (`persistTranslations`, le REST) et le cache de fil (`ConversationSyncEngine.handleAttachmentUpdated`). Effaceurs :
/// `markDeleted` (suppression et échéance) et `markViewOnceOpened`. La garde `TranslationWriterCallSitesGuardTests`
/// tient la liste des sites qui écrivent une traduction : un nouveau site doit d'abord passer par cette loi.
public enum MessageEnrichmentLaw {

    /// Le contenu se garde-t-il encore en clair dans la base ?
    public static func keepsEnrichments(
        sealedEndToEnd: Bool, viewOnceOpenedAt: Date?, deletedAt: Date?, expiresAt: Date?, now: Date = Date()
    ) -> Bool {
        guard !sealedEndToEnd, viewOnceOpenedAt == nil, deletedAt == nil else { return false }
        return expiresAt.map { $0 > now } ?? true
    }

    public static func keepsEnrichments(of record: MessageRecord, now: Date = Date()) -> Bool {
        keepsEnrichments(
            sealedEndToEnd: EndToEndDiskPlaintextLaw.sealsContent(isEncrypted: record.isEncrypted, encryptionMode: record.encryptionMode),
            viewOnceOpenedAt: record.viewOnceOpenedAt, deletedAt: record.deletedAt, expiresAt: record.expiresAt, now: now
        )
    }

    public static func keepsEnrichments(of message: MeeshyMessage, now: Date = Date()) -> Bool {
        keepsEnrichments(
            sealedEndToEnd: EndToEndDiskPlaintextLaw.sealsContent(isEncrypted: message.isEncrypted, encryptionMode: message.encryptionMode),
            viewOnceOpenedAt: message.viewOnceOpenedAt, deletedAt: message.deletedAt, expiresAt: message.expiresAt, now: now
        )
    }

    /// La ligne d'un message, par son identifiant local OU serveur : une traduction et une pièce enrichie portent
    /// l'identifiant SERVEUR, la ligne d'un message envoyé d'ici garde son identifiant optimiste.
    static func row(of messageId: String, in db: Database) throws -> MessageRecord? {
        try MessageRecord.filter(Column("localId") == messageId || Column("serverId") == messageId).fetchOne(db)
    }

    /// Le contenu de `record` vient d'être effacé : ses traductions, et les transcriptions et pistes traduites de ses
    /// pièces, partent avec lui. Une ligne déjà scellée (`attachmentsJson` vide) ne perd que ses traductions.
    static func erase(enrichmentsOf record: MessageRecord, in db: Database) throws {
        _ = try TranslationRecord
            .filter(Column("messageLocalId") == record.localId
                    || Column("messageServerId") == (record.serverId ?? record.localId))
            .deleteAll(db)
        guard let pieces = record.attachmentsJson else { return }
        try db.execute(
            sql: "UPDATE messages SET attachmentsJson = ? WHERE localId = ?",
            arguments: [strippedOfEnrichments(pieces), record.localId]
        )
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
