package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import me.meeshy.core.database.entity.MessageAudioTranslationEntity
import me.meeshy.core.database.entity.MessageTranscriptionEntity
import me.meeshy.core.database.entity.MessageTranslationEntity

/** Les traductions, transcriptions et pistes audio traduites déjà reçues, hors de la charge du message. */
@Dao
public interface MessageTranslationDao {

    @Upsert
    public suspend fun upsertText(row: MessageTranslationEntity)

    @Upsert
    public suspend fun upsertTranscription(row: MessageTranscriptionEntity)

    @Upsert
    public suspend fun upsertAudio(row: MessageAudioTranslationEntity)

    @Query("SELECT * FROM message_translations WHERE messageId IN (:messageIds)")
    public suspend fun textsFor(messageIds: List<String>): List<MessageTranslationEntity>

    @Query("SELECT * FROM message_transcriptions WHERE messageId IN (:messageIds)")
    public suspend fun transcriptionsFor(messageIds: List<String>): List<MessageTranscriptionEntity>

    @Query("SELECT * FROM message_audio_translations WHERE messageId IN (:messageIds)")
    public suspend fun audioFor(messageIds: List<String>): List<MessageAudioTranslationEntity>

    @Query("DELETE FROM message_translations WHERE messageId IN (:messageIds)")
    public suspend fun deleteTextsFor(messageIds: List<String>)

    @Query("DELETE FROM message_transcriptions WHERE messageId IN (:messageIds)")
    public suspend fun deleteTranscriptionsFor(messageIds: List<String>)

    /** La traduction retenue de [language] (minuscules) ne dit plus ce que le serveur sert : elle cède à la charge. */
    @Query("DELETE FROM message_translations WHERE messageId IN (:messageIds) AND language = :language")
    public suspend fun deleteTextFor(messageIds: List<String>, language: String)

    @Query("DELETE FROM message_audio_translations WHERE messageId IN (:messageIds)")
    public suspend fun deleteAudioFor(messageIds: List<String>)

    /** La transcription retenue de ces pièces ne dit plus ce que le serveur sert : elle cède à la charge. */
    @Query("DELETE FROM message_transcriptions WHERE messageId IN (:messageIds) AND attachmentId IN (:attachmentIds)")
    public suspend fun deleteTranscriptionsOf(messageIds: List<String>, attachmentIds: List<String>)

    /** La piste parlée retenue de [language] (minuscules) pour cette pièce cède à celle que le serveur sert. */
    @Query("DELETE FROM message_audio_translations WHERE messageId IN (:messageIds) AND attachmentId = :attachmentId AND language = :language")
    public suspend fun deleteAudioTrackOf(messageIds: List<String>, attachmentId: String, language: String)

    /**
     * Les messages ENCORE EN CACHE dont une traduction a été reçue le plus récemment : de quoi pré-hydrater le L1 au
     * démarrage. Une ligne dont le message est parti n'est jamais rechargée.
     */
    @Query(
        "SELECT t.messageId FROM message_translations t " +
            "WHERE EXISTS (SELECT 1 FROM messages m WHERE m.id = t.messageId) " +
            "OR EXISTS (SELECT 1 FROM messages m WHERE m.serverId = t.messageId) " +
            "GROUP BY t.messageId ORDER BY MAX(t.updatedAt) DESC LIMIT :limit",
    )
    public suspend fun recentTranslatedMessageIds(limit: Int): List<String>
}
