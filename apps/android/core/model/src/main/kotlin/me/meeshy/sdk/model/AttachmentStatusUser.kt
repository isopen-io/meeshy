package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Qui a reçu, lu, écouté ou regardé une pièce jointe — miroir de `AttachmentStatusUser` (iOS),
 * ligne de `GET /attachments/:id/status-details`. Clé = `participantId` ; les horodatages sont
 * des chaînes ISO-8601 laissées telles quelles. Tout est optionnel : une charge ancienne
 * décode en « on ne sait pas », jamais en « zéro ».
 */
@Serializable
data class AttachmentStatusUser(
    val participantId: String,
    val username: String = "",
    val avatar: String? = null,
    val viewedAt: String? = null,
    val downloadedAt: String? = null,
    val listenedAt: String? = null,
    val watchedAt: String? = null,
    val listenCount: Int? = null,
    val watchCount: Int? = null,
    val viewCount: Int? = null,
    val listenedComplete: Boolean? = null,
    val watchedComplete: Boolean? = null,
    val lastPlayPositionMs: Int? = null,
    val lastWatchPositionMs: Int? = null,
) {
    val id: String get() = participantId
}

/** Corps de `POST /attachments/:id/transcribe` — `force = true` refait une transcription existante. */
@Serializable
data class TranscribeRequest(val force: Boolean)
