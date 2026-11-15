package me.meeshy.sdk.model.composer.timeline.engine

/** La tolérance d'un seek vidéo : à l'image au relâché, ~50 ms pendant le geste (miroir de `seek(to:precise:)`). */
object TimelineSeek {

    const val SCRUB_TOLERANCE_MS: Long = 50L

    fun toleranceMs(precise: Boolean): Long = if (precise) 0L else SCRUB_TOLERANCE_MS
}

/**
 * Compteur de génération : un seek, un play ou une pause postérieurs invalident les fins de seek en vol, et seule la
 * DERNIÈRE ré-ancre l'audio sur la vidéo.
 */
class SeekGeneration {
    private var value: Long = 0L

    fun advance(): Long {
        value += 1
        return value
    }

    fun isCurrent(generation: Long): Boolean = generation == value
}
