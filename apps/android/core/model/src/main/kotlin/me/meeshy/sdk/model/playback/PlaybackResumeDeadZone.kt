package me.meeshy.sdk.model.playback

/**
 * **La zone morte de reprise** — port de `AudioPlaybackManager.isResumable` et de `PlaybackResumeLaw`
 * d'iOS, la même règle pour l'audio et la vidéo.
 *
 * Une position n'est reprise que si elle tient bien DANS la piste : jamais à moins d'une seconde
 * d'un bord (collée à zéro elle n'apporte rien, collée à la fin elle rejouerait le dernier instant
 * avant de finir), et jamais sur une piste de moins de deux secondes (un vocal d'une seconde se
 * rejoue en entier). Un seul site : le chemin de reprise, le chemin de sauvegarde et le timecode de
 * la bulle demandent tous la même chose ici, pour que l'interface ne promette jamais une reprise
 * que le moteur ignorerait.
 */
public object PlaybackResumeDeadZone {

    public const val MIN_RESUMABLE_DURATION_MS: Long = 2_000L
    public const val EDGE_GUARD_MS: Long = 1_000L

    /** Écart toléré entre la reprise mémorisée et la tête du lecteur : un seek tolérant suffit. */
    public const val TOLERANCE_MS: Long = 500L

    public fun isResumable(savedMs: Long, totalMs: Long): Boolean =
        totalMs >= MIN_RESUMABLE_DURATION_MS &&
            savedMs > EDGE_GUARD_MS &&
            savedMs < totalMs - EDGE_GUARD_MS

    /** Ce que le moteur fait de la tête d'un lecteur qu'il vient de préparer. */
    public sealed interface Action {
        /** La tête est déjà au bon endroit : lecture seulement. */
        public data object None : Action

        /** Un seek tolérant vers cette position, AVANT la lecture. */
        public data class SeekTo(val positionMs: Long) : Action
    }

    /**
     * Une tête au-delà de la reprise ne recule jamais : le lecteur a continué depuis elle, la ramener
     * en arrière rejouerait ce que l'utilisateur vient d'entendre.
     */
    public fun action(savedMs: Long?, currentMs: Long): Action {
        if (savedMs == null) return Action.None
        val head = currentMs.coerceAtLeast(0L)
        return if (head >= savedMs - TOLERANCE_MS) Action.None else Action.SeekTo(savedMs)
    }
}
