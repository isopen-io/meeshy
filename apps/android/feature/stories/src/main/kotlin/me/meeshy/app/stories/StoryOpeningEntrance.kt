package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.scene.SceneRootTransitionPose

/**
 * L'état de DÉPART des pilotes d'apparition d'une story, dérivé de la transition d'OUVERTURE choisie par l'auteur
 * (iOS `StoryOpeningEntrance`). Une seule table sert le fondu enchaîné intra-groupe, l'interlude d'identité et un
 * commit de cube : un zoom reste un zoom, quel que soit le chemin d'arrivée.
 *
 * [openingSlideFraction] est horizontal, en fraction de la largeur ; [textSlideOffsetDp] est le micro-décalage
 * vertical du fondu seul.
 */
internal data class StoryOpeningEntrance(
    val contentOpacity: Float,
    val openingScale: Float,
    val openingSlideFraction: Float,
    val textSlideOffsetDp: Float,
    val isRevealActive: Boolean,
) {
    companion object {
        private const val FADE_TEXT_OFFSET_DP = 14f
        private const val PLAIN_FADE_MILLIS = 350

        fun armed(opening: StoryTransitionEffect?): StoryOpeningEntrance = when (opening) {
            StoryTransitionEffect.ZOOM -> StoryOpeningEntrance(0f, SceneRootTransitionPose.ZOOM_SCALE.toFloat(), 0f, 0f, false)
            StoryTransitionEffect.SLIDE -> StoryOpeningEntrance(0f, 1f, SceneRootTransitionPose.SLIDE_TRAVEL_FRACTION.toFloat(), 0f, false)
            StoryTransitionEffect.REVEAL -> StoryOpeningEntrance(0f, 1f, 0f, 0f, false)
            StoryTransitionEffect.FADE, null -> StoryOpeningEntrance(0f, 1f, 0f, FADE_TEXT_OFFSET_DP, false)
        }

        fun rest(opening: StoryTransitionEffect?): StoryOpeningEntrance =
            StoryOpeningEntrance(1f, 1f, 0f, 0f, opening == StoryTransitionEffect.REVEAL)

        /** Les trois effets nommés partagent la durée commune (1,2 s) ; le fondu simple garde 0,35 s. */
        fun durationMillis(opening: StoryTransitionEffect?): Int = when (opening) {
            StoryTransitionEffect.ZOOM, StoryTransitionEffect.SLIDE, StoryTransitionEffect.REVEAL ->
                (SceneRootTransitionPose.DURATION_SECONDS * 1000).toInt()
            StoryTransitionEffect.FADE, null -> PLAIN_FADE_MILLIS
        }
    }
}
