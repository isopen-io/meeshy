package me.meeshy.sdk.model.story

import kotlin.math.max
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.UserPresence

/** Comment l'interlude se retire : le ressort des entrées zoom/glissé, ou un fondu d'une durée donnée. */
sealed interface StoryGroupIntroDismissal {
    data object Spring : StoryGroupIntroDismissal
    data class Tween(val millis: Int) : StoryGroupIntroDismissal
}

enum class StoryGroupIntroAction { Skip, Back }

/**
 * Quand et comment présenter l'interlude d'identité (iOS `StoryGroupIntroPolicy`). Il n'a lieu qu'au CHANGEMENT de
 * groupe — jamais à l'ouverture du lecteur, qui reste instantanée — quelle que soit l'identité de l'auteur, hors
 * aperçu du composeur et hors groupe sans story affichable.
 */
object StoryGroupIntroPolicy {
    /** Durée nominale de l'interlude. */
    const val TOTAL_MILLIS: Int = 500

    /** Avance de l'apparition du slide sur la fin annoncée du voile : les deux se recouvrent. */
    const val REVEAL_OVERLAP_MILLIS: Int = 200

    fun shouldPresentOnSwitch(previousGroupIndex: Int?, newGroupIndex: Int, isPreview: Boolean, hasEntryStory: Boolean): Boolean =
        previousGroupIndex != null && previousGroupIndex != newGroupIndex && !isPreview && hasEntryStory

    /** L'attente RÉELLE avant le retrait : jamais négative (une durée plus courte que le recouvrement révèle aussitôt). */
    fun holdMillis(total: Int = TOTAL_MILLIS): Int = max(0, total - REVEAL_OVERLAP_MILLIS)

    fun dismissal(opening: StoryTransitionEffect?): StoryGroupIntroDismissal = when (opening) {
        StoryTransitionEffect.ZOOM, StoryTransitionEffect.SLIDE -> StoryGroupIntroDismissal.Spring
        StoryTransitionEffect.REVEAL -> StoryGroupIntroDismissal.Tween(400)
        StoryTransitionEffect.FADE, null -> StoryGroupIntroDismissal.Tween(300)
    }

    /**
     * Le détail de présence (en ligne, absent, inactif) est réservé aux amis acceptés ; hors ligne ou sans présence
     * servie, aucun badge (règle 1/3/5 : le gris « hors ligne » ne se pose pas sur une identité).
     */
    fun presenceDetail(isFriend: Boolean, presence: UserPresence?, nowEpochMillis: Long): PresenceState? =
        presence?.takeIf { isFriend }?.state(nowEpochMillis)?.takeUnless { it == PresenceState.OFFLINE }
}

object StoryGroupIntroGesture {
    fun onDoubleTap(): StoryGroupIntroAction = StoryGroupIntroAction.Skip

    /** Moitié gauche : annule le changement de groupe ; moitié droite : passe à la première slide. */
    fun onTap(x: Float, width: Float): StoryGroupIntroAction =
        if (x < width / 2f) StoryGroupIntroAction.Back else StoryGroupIntroAction.Skip
}
