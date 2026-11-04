package me.meeshy.core.database.entity

import androidx.room.Entity

/** La transcription déjà reçue d'une pièce jointe audio, unique par (message, pièce jointe). */
@Entity(
    tableName = "message_transcriptions",
    primaryKeys = ["messageId", "attachmentId"],
)
public data class MessageTranscriptionEntity(
    val messageId: String,
    val attachmentId: String,
    val text: String,
    val language: String?,
    val confidence: Double?,
    val durationMs: Int?,
    val updatedAt: Long,
)
