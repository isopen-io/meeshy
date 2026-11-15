package me.meeshy.sdk.model

/**
 * Où ENTRE un objet posé sur une scène animée (miroir de `StoryEffects+EntryWindow.swift`,
 * #8370) : à la tête de lecture, jusqu'à la fin, et jamais au delà de 80 % de la durée.
 */
object SceneEntryWindow {

    const val LATEST_ENTRY_FRACTION: Double = 0.8

    data class Window(val start: Double, val duration: Double)

    fun forNewObject(playhead: Double, slideDuration: Double): Window {
        val total = if (slideDuration.isFinite()) maxOf(0.0, slideDuration) else 0.0
        val head = if (playhead.isFinite()) playhead else 0.0
        val start = maxOf(0.0, minOf(head, total * LATEST_ENTRY_FRACTION))
        return Window(start, total - start)
    }
}

/** Identifiants de ce que la scène POSE — le fond n'en est pas : il ne se règle pas dans le temps. */
fun StoryEffects.timedObjectIds(): List<String> =
    textObjects.map { it.id } +
        mediaObjects.orEmpty().filter { !it.isBackground }.map { it.id } +
        stickerObjects.orEmpty().map { it.id } +
        audioPlayerObjects.orEmpty().map { it.id }

/** Pose la fenêtre d'un objet quelle que soit sa famille ; `null` quand l'id ne désigne rien (ou un fond). */
fun StoryEffects.withWindow(id: String, start: Double, duration: Double): StoryEffects? {
    if (textObjects.any { it.id == id }) {
        return copy(textObjects = textObjects.map { if (it.id == id) it.copy(startTime = start, duration = duration) else it })
    }
    if (mediaObjects.orEmpty().any { it.id == id && !it.isBackground }) {
        return copy(mediaObjects = mediaObjects?.map { if (it.id == id) it.copy(startTime = start, duration = duration) else it })
    }
    if (stickerObjects.orEmpty().any { it.id == id }) {
        return copy(stickerObjects = stickerObjects?.map { if (it.id == id) it.copy(startTime = start, duration = duration) else it })
    }
    if (audioPlayerObjects.orEmpty().any { it.id == id }) {
        return copy(
            audioPlayerObjects = audioPlayerObjects?.map {
                if (it.id == id) it.copy(startTime = start.toFloat(), duration = duration.toFloat()) else it
            },
        )
    }
    return null
}
