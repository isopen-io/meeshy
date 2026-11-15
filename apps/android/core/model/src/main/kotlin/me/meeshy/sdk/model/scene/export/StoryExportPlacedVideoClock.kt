package me.meeshy.sdk.model.scene.export

/**
 * **L'HORLOGE D'UNE VIDÉO POSÉE DANS L'EXPORT** (#13897) — une vidéo de premier plan est à l'écran de [startMillis] à
 * [endMillis] sur la timeline commune de l'export, et montre à chaque instant l'image de sa source que le lecteur montre :
 * la fenêtre coupée par l'auteur ([window]), lue en boucle tant que l'objet est là (le lecteur la joue en
 * `REPEAT_MODE_ONE`). Pure : la durée du fichier est REÇUE (sondée sur l'appareil).
 */
public data class StoryExportPlacedVideoClock(val startMillis: Long, val endMillis: Long, val window: StoryExportClipRange) {

    /** L'instant de la source montré à [timeMillis] de la composition ; `null` : l'objet n'est pas à l'écran. */
    public fun sourceAt(timeMillis: Long): Long? {
        if (timeMillis < startMillis || timeMillis >= endMillis) return null
        return window.startMillis + (timeMillis - startMillis) % window.durationMillis
    }

    public companion object {
        /**
         * La présence de l'objet ([objectStartSeconds], [objectDurationSeconds] ; une durée nulle tient toute la slide,
         * comme `StoryElementVisibility`) bornée à sa slide, et la fenêtre de source (une coupe vieillie relit le fichier
         * entier, comme [StoryExportClipLoop]). `null` : rien à poser (objet hors de sa slide, fichier sans durée).
         */
        public fun of(
            slideStartMillis: Long,
            slideDurationMillis: Long,
            objectStartSeconds: Double,
            objectDurationSeconds: Double,
            trimStartMillis: Long?,
            trimEndMillis: Long?,
            clipDurationMillis: Long,
        ): StoryExportPlacedVideoClock? {
            if (clipDurationMillis <= 0L || slideDurationMillis <= 0L) return null
            val enters = millis(objectStartSeconds).coerceAtLeast(0L)
            val leaves = if (objectDurationSeconds > 0.0 && objectDurationSeconds.isFinite()) enters + millis(objectDurationSeconds) else slideDurationMillis
            val end = minOf(leaves, slideDurationMillis)
            if (enters >= end) return null
            val from = (trimStartMillis ?: 0L).coerceIn(0L, clipDurationMillis)
            val declaredEnd = trimEndMillis?.let { minOf(it, clipDurationMillis) } ?: clipDurationMillis
            val window = if (declaredEnd > from) StoryExportClipRange(from, declaredEnd) else StoryExportClipRange(0L, clipDurationMillis)
            return StoryExportPlacedVideoClock(slideStartMillis + enters, slideStartMillis + end, window)
        }

        private fun millis(seconds: Double): Long = if (seconds.isFinite()) Math.round(seconds * MILLIS_PER_SECOND) else 0L

        private const val MILLIS_PER_SECOND = 1000.0
    }
}
