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

    @Query("DELETE FROM message_audio_translations WHERE messageId IN (:messageIds)")
    public suspend fun deleteAudioFor(messageIds: List<String>)

    /** Les messages dont une traduction a été reçue le plus récemment : de quoi pré-hydrater le L1 au démarrage. */
    @Query("SELECT messageId FROM message_translations GROUP BY messageId ORDER BY MAX(updatedAt) DESC LIMIT :limit")
    public suspend fun recentTranslatedMessageIds(limit: Int): List<String>
}
