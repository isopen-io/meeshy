package me.meeshy.sdk.model

/** Ce qu'il faut d'un son de la bibliothèque pour le publier seul (sous-ensemble d'`APISound`). */
data class BorrowedSound(
    val id: String,
    val title: String,
    val fileUrl: String,
    val durationMs: Long? = null,
    val waveform: List<Float> = emptyList(),
    val uploaderUsername: String? = null,
    val createdAt: String? = null,
)

/**
 * Construction PURE d'un post/réel « son emprunté seul » — miroir de `BorrowedSoundPost`
 * (iOS). Le blob porte l'unique piste empruntée : `soundId` + `mediaURL` serveur,
 * `postMediaId` vide, comme `addBorrowedSound` du composer de story.
 */
object BorrowedSoundPost {
    fun effects(sound: BorrowedSound): StoryEffects =
        StoryEffects(
            audioPlayerObjects = listOf(
                StoryAudioPlayerObject(
                    id = "borrowed-${sound.id}",
                    postMediaId = "",
                    placement = "overlay",
                    x = 0.5,
                    y = 0.65,
                    volume = 1.0f,
                    waveformSamples = sound.waveform,
                    isBackground = true,
                    duration = sound.durationMs?.let { it / 1000f },
                    name = sound.title.trim().takeIf { it.isNotEmpty() },
                    mediaURL = sound.fileUrl,
                    soundId = sound.id,
                    soundAuthorUsername = sound.uploaderUsername,
                    soundCreatedAt = sound.createdAt,
                ),
            ),
        )

    /** Un son >= 3 s qualifie un RÉEL ; `forcePlainPost` reste respecté. */
    fun type(sound: BorrowedSound, forcePlainPost: Boolean): PostType {
        val qualifies = (sound.durationMs ?: 0L) >= ReelComposition.MIN_QUALIFYING_DURATION_MS
        return if (!forcePlainPost && qualifies) PostType.REEL else PostType.POST
    }
}
