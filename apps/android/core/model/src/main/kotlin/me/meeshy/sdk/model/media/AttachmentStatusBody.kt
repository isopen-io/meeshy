package me.meeshy.sdk.model.media

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Ce qui a mis fin à une écoute continue (iOS `StretchEnd`). */
@Serializable
public enum class StretchEnd {
    @SerialName("pause") PAUSE,
    @SerialName("seek") SEEK,
    @SerialName("muted") MUTED,
    @SerialName("completed") COMPLETED,
    @SerialName("dismissed") DISMISSED,
    @SerialName("superseded") SUPERSEDED,
}

/** Une écoute réellement continue, avec la frontière qui l'a fermée. */
@Serializable
public data class PlaybackStretch(
    val startMs: Int,
    val endMs: Int,
    val endedBy: StretchEnd,
)

/**
 * Corps du rapport de consommation d'une pièce jointe (`POST …/attachments/:id/status`).
 * Sérialisable : l'outbox le rejoue tel quel. Tout champ optionnel est omis quand inconnu
 * (le Json réseau n'encode pas les défauts) ; un tableau d'écoutes vide n'est jamais émis.
 */
@Serializable
public data class AttachmentStatusBody(
    val action: String,
    val playPositionMs: Int,
    val durationMs: Int,
    val complete: Boolean,
    val wasZoomed: Boolean? = null,
    val stretches: List<PlaybackStretch>? = null,
    val language: String? = null,
) {
    /** Forme normalisée : `stretches` vide devient `null`. */
    public fun normalized(): AttachmentStatusBody =
        if (stretches?.isEmpty() == true) copy(stretches = null) else this

    public companion object {
        public const val ACTION_VIEWED: String = "viewed"
        public const val ACTION_DOWNLOADED: String = "downloaded"
        public const val ACTION_LISTENED: String = "listened"
        public const val ACTION_WATCHED: String = "watched"
    }
}
