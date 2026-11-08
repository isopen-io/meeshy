package me.meeshy.sdk.model.composer.timeline

import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.timeline.TimelineProject

/**
 * La liaison entre la slide du composer et le projet que la timeline édite (miroir de
 * `StoryComposerViewModel+Timeline.swift`). À l'ouverture la slide est CHARGÉE dans un projet, à la
 * fermeture (et avant tout autosave ou toute publication) le projet est RÉÉCRIT dans les effets.
 *
 * Un fond image statique n'est pas un objet média de la slide : pour qu'on le voie sous la
 * composition, il apparaît sur la timeline comme un clip SYNTHÉTIQUE verrouillé, permanent, que la
 * réécriture retire — les effets de la slide restent propres.
 */
object TimelineSlideBinding {

    const val SYNTHETIC_PREFIX: String = "_synthetic_bg_image_"

    fun isSynthetic(clipId: String): Boolean = clipId.startsWith(SYNTHETIC_PREFIX)

    /**
     * Le clip du fond image, ou `null` : pas de fond image, ou un vrai fond existe déjà (il gagne).
     * Sa durée est absente (clip permanent) : il suit la slide jusqu'à sa fin sans jamais l'allonger.
     */
    fun syntheticBackground(
        slideId: String,
        hasBackgroundImage: Boolean,
        existing: List<StoryMediaObject>,
        imageAspectRatio: Double?,
    ): StoryMediaObject? {
        if (!hasBackgroundImage || existing.any { it.isBackground }) return null
        return StoryMediaObject(
            id = SYNTHETIC_PREFIX + slideId,
            postMediaId = "_bg_image_$slideId",
            mediaType = "image",
            aspectRatio = imageAspectRatio?.takeIf { it.isFinite() && it > 0.0 } ?: 1.0,
            volume = 0f,
            isBackground = true,
            startTime = 0.0,
        )
    }

    /** La slide courante devenue projet : les chips d'ouverture et de fermeture sont ceux du composer vivant. */
    fun load(
        slide: StorySlide,
        hasBackgroundImage: Boolean = false,
        imageAspectRatio: Double? = null,
        openingEffect: StoryTransitionEffect? = slide.effects.opening,
        closingEffect: StoryTransitionEffect? = slide.effects.closing,
    ): TimelineProject {
        val base = TimelineProject.from(slide).copy(openingEffect = openingEffect, closingEffect = closingEffect)
        val synthetic = syntheticBackground(slide.id, hasBackgroundImage, base.mediaObjects, imageAspectRatio)
            ?: return base
        return base.copy(mediaObjects = listOf(synthetic) + base.mediaObjects)
    }

    /** Le projet réécrit dans la slide, sans aucun clip synthétique. */
    fun commit(project: TimelineProject, slide: StorySlide): StorySlide =
        project.copy(mediaObjects = project.mediaObjects.filterNot { isSynthetic(it.id) }).applyTo(slide)

    /** Une slide qui n'a jamais été éditée revient à l'identique (aller-retour sans perte). */
    fun roundTrips(slide: StorySlide, hasBackgroundImage: Boolean = false): Boolean =
        commit(load(slide, hasBackgroundImage), slide) == slide
}
