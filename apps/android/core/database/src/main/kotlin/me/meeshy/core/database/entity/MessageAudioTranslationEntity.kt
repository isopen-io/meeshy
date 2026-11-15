package me.meeshy.core.database.entity

import androidx.room.Entity

/** Une piste audio traduite déjà reçue, unique par (message, pièce jointe, langue). */
@Entity(
    tableName = "message_audio_translations",
    primaryKeys = ["messageId", "attachmentId", "language"],
)
public data class MessageAudioTranslationEntity(
    val messageId: String,
    val attachmentId: String,
    val language: String,
    val url: String,
    val transcription: String,
    val durationMs: Int?,
    val format: String?,
    val cloned: Boolean,
    val quality: Double?,
    val voiceModelId: String?,
    val ttsModel: String?,
    val updatedAt: Long,
)
