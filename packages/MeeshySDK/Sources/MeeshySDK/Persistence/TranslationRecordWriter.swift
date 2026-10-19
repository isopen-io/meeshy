import Foundation
import GRDB

/// Écriture d'une traduction persistée, quel que soit le schéma d'id sous lequel elle arrive.
enum TranslationRecordWriter {
    /// grdb-06 — deux schémas d'id coexistent pour la même (message, langue) :
    /// le fallback socket horodaté (`m1_en_1700…`) et l'id serveur stable
    /// (`m1-en`). Un save par PK sur un id différent viole l'index UNIQUE
    /// `idx_trans_msg_lang` ; l'upsert cible cet index pour REMPLACER la row,
    /// quel que soit l'id sous lequel elle était arrivée.
    static func upsert(_ record: TranslationRecord, in db: Database) throws {
        try db.execute(
            sql: """
            INSERT INTO message_translations
                (id, messageLocalId, messageServerId, targetLanguage,
                 translatedContent, translationModel, confidenceScore,
                 sourceLanguage, receivedAt)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(messageLocalId, targetLanguage) DO UPDATE SET
                id = excluded.id,
                messageServerId = excluded.messageServerId,
                translatedContent = excluded.translatedContent,
                translationModel = excluded.translationModel,
                confidenceScore = excluded.confidenceScore,
                sourceLanguage = excluded.sourceLanguage,
                receivedAt = excluded.receivedAt
            """,
            arguments: [
                record.id, record.messageLocalId, record.messageServerId,
                record.targetLanguage, record.translatedContent,
                record.translationModel, record.confidenceScore,
                record.sourceLanguage, record.receivedAt
            ]
        )
    }
}
