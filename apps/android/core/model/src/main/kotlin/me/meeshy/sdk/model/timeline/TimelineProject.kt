package me.meeshy.sdk.model.timeline

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTransitionEffect
import kotlin.math.abs

/**
 * Instantané immuable d'une slide pour le patron Commande (annuler/rétablir) —
 * miroir de `TimelineProject` (StoryTimelineProject.swift).
 *
 * Aller-retour garanti : `TimelineProject.from(slide).applyTo(slide)` est un no-op.
 *
 * [locationObjects] : `StoryEffects` ne porte pas encore les pastilles de lieu
 * côté Android ; elles circulent dans le projet (commandes de fenêtre) mais
 * [applyTo] ne les réécrit pas dans la slide.
 */
@Serializable
data class TimelineProject(
    val slideId: String,
    val slideDuration: Float,
    val mediaObjects: List<StoryMediaObject> = emptyList(),
    val audioPlayerObjects: List<StoryAudioPlayerObject> = emptyList(),
    val textObjects: List<StoryTextObject> = emptyList(),
    val stickerObjects: List<StorySticker> = emptyList(),
    val locationObjects: List<StoryLocationObject> = emptyList(),
    val clipTransitions: List<StoryClipTransition> = emptyList(),
    /** Lecture seule : capturés pour la piste de chrome, jamais réécrits par [applyTo]. */
    val openingEffect: StoryTransitionEffect? = null,
    val closingEffect: StoryTransitionEffect? = null,
) {

    /**
     * Réécrit la slide. Une collection vide revient à `null` (comme iOS), et la
     * durée d'auteur n'est épinglée que si elle diffère de la durée du contenu.
     * Sur une slide que le projet n'a pas changée, rend la slide à l'identique.
     */
    fun applyTo(slide: StorySlide): StorySlide {
        val effects = slide.effects
        val content = StorySlideDuration.contentDerivedSeconds(
            mediaObjects = mediaObjects.ifEmpty { null },
            audioPlayerObjects = audioPlayerObjects.ifEmpty { null },
            textObjects = textObjects,
        )
        val authored = slideDuration.toDouble()
        val pinned = effects.timelineDuration
        val timelineDuration = when {
            pinned != null && abs(pinned - authored) < FLOAT_ROUNDING -> pinned
            abs(authored - content) <= DURATION_EPSILON -> null
            else -> authored
        }
        val updatedEffects = effects.copy(
            mediaObjects = mediaObjects.ifEmpty { null },
            audioPlayerObjects = audioPlayerObjects.ifEmpty { null },
            textObjects = textObjects,
            stickerObjects = stickerObjects.ifEmpty { null },
            clipTransitions = clipTransitions.ifEmpty { null },
            timelineDuration = timelineDuration,
        )
        val mirrorStale = abs(from(slide).slideDuration - slideDuration) > FLOAT_ROUNDING
        return slide.copy(
            effects = updatedEffects,
            duration = if (mirrorStale) authored else slide.duration,
        )
    }

    internal fun updateMedia(id: String, change: (StoryMediaObject) -> StoryMediaObject): TimelineProject =
        copy(mediaObjects = mediaObjects.updateById(id, { it.id }, change))

    internal fun updateAudio(id: String, change: (StoryAudioPlayerObject) -> StoryAudioPlayerObject): TimelineProject =
        copy(audioPlayerObjects = audioPlayerObjects.updateById(id, { it.id }, change))

    internal fun updateText(id: String, change: (StoryTextObject) -> StoryTextObject): TimelineProject =
        copy(textObjects = textObjects.updateById(id, { it.id }, change))

    internal fun updateSticker(id: String, change: (StorySticker) -> StorySticker): TimelineProject =
        copy(stickerObjects = stickerObjects.updateById(id, { it.id }, change))

    internal fun updatePlace(id: String, change: (StoryLocationObject) -> StoryLocationObject): TimelineProject =
        copy(locationObjects = locationObjects.updateById(id, { it.id }, change))

    companion object {
        private const val DURATION_EPSILON = 0.05
        private const val FLOAT_ROUNDING = 1e-4

        fun from(slide: StorySlide): TimelineProject = TimelineProject(
            slideId = slide.id,
            slideDuration = StorySlideDuration.computeSeconds(slide.effects).toFloat(),
            mediaObjects = slide.effects.mediaObjects.orEmpty(),
            audioPlayerObjects = slide.effects.audioPlayerObjects.orEmpty(),
            textObjects = slide.effects.textObjects,
            stickerObjects = slide.effects.stickerObjects.orEmpty(),
            clipTransitions = slide.effects.clipTransitions.orEmpty(),
            openingEffect = slide.effects.opening,
            closingEffect = slide.effects.closing,
        )
    }
}

private fun <T> List<T>.updateById(id: String, idOf: (T) -> String, change: (T) -> T): List<T> {
    val index = indexOfFirst { idOf(it) == id }
    if (index < 0) throw EditCommandError.ClipNotFound(id)
    return toMutableList().also { it[index] = change(it[index]) }
}
