package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * Un segment de la transcription d'un appel, local à l'appareil (miroir de `CallTranscriptSegment` iOS).
 *
 * Unique par (appel, `wireId`) : rejouer un segment est un no-op, et une reprise après coupure ajoute ses segments à ceux
 * d'avant. `callStartedAt` est répété sur chaque ligne de l'appel (le plus ancien l'emporte, voir `CallTranscriptDao.saveMerging`).
 */
@Entity(
    tableName = "call_transcript",
    primaryKeys = ["callId", "wireId"],
    indices = [Index(value = ["callId", "capturedAt"])],
)
public data class CallTranscriptEntity(
    val callId: String,
    val wireId: String,
    val conversationId: String,
    val callStartedAt: Long,
    val speakerId: String,
    val speakerName: String,
    val isLocal: Boolean,
    val text: String,
    val translatedText: String?,
    val translatedLanguage: String?,
    val language: String?,
    val capturedAt: Long,
)
