package me.meeshy.app.stories

import kotlin.math.abs

/** Un rectangle en coordonnées de la fenêtre racine ; pur, sans Compose, pour que la cession se prouve sans écran. */
internal data class StoryDragRegion(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    fun contains(x: Float, y: Float): Boolean = x >= left && x <= right && y >= top && y <= bottom

    fun union(other: StoryDragRegion): StoryDragRegion =
        StoryDragRegion(minOf(left, other.left), minOf(top, other.top), maxOf(right, other.right), maxOf(bottom, other.bottom))
}

/** Les cadres que le glissé du lecteur consulte à son départ. Un cadre absent est une zone qui n'existe pas. */
internal data class StoryDragFrames(
    val rail: StoryDragRegion? = null,
    val reactionBar: StoryDragRegion? = null,
    val composer: StoryDragRegion? = null,
    val scrollableSurfaceTop: Float? = null,
    val hasScrollableSurface: Boolean = false,
)

/** À qui appartient un glissé, d'après l'endroit où il est né — iOS `StoryReaderDragOwnership.swift`. */
internal enum class StoryDragOwner { Reader, ReactionBar, Composer, Rail, ScrollableSurface }

internal enum class StoryDragAxis { Undecided, Horizontal, Vertical }

internal object StoryReaderDragOwnership {
    /**
     * Le propriétaire du glissé né en ([x], [y]). Le panneau défilant prime (un doigt qui défile n'est jamais un
     * glissé de lecteur), puis le composeur, le rail, la barre de réactions ; sinon le lecteur.
     */
    fun ownerAt(x: Float, y: Float, frames: StoryDragFrames): StoryDragOwner = when {
        StoryReaderDragStartZone.yieldsToScrollableSurface(frames.hasScrollableSurface, frames.scrollableSurfaceTop, y) ->
            StoryDragOwner.ScrollableSurface
        frames.composer?.contains(x, y) == true -> StoryDragOwner.Composer
        frames.rail?.contains(x, y) == true -> StoryDragOwner.Rail
        frames.reactionBar?.contains(x, y) == true -> StoryDragOwner.ReactionBar
        else -> StoryDragOwner.Reader
    }

    /** Le lecteur ne tient AUCUN axe de ce glissé : ni groupe, ni fermeture, ni plein écran. */
    fun yieldsEverything(owner: StoryDragOwner): Boolean = when (owner) {
        StoryDragOwner.Reader, StoryDragOwner.ReactionBar -> false
        StoryDragOwner.Composer, StoryDragOwner.Rail, StoryDragOwner.ScrollableSurface -> true
    }

    /**
     * La barre de réactions défile horizontalement : elle garde cet axe. Le vertical né sur elle reste au lecteur, qui
     * le traite comme celui d'une surface ouverte (la barre se referme, la story reste).
     */
    fun yieldsHorizontalAxis(owner: StoryDragOwner): Boolean = owner == StoryDragOwner.ReactionBar || yieldsEverything(owner)
}

/** Cession sur le POINT DE DÉPART aux panneaux défilants — iOS `StoryReaderDragStartZone`. */
internal object StoryReaderDragStartZone {
    /**
     * Aucune surface ouverte ⇒ le lecteur s'exécute intégralement. Surface ouverte et bord connu ⇒ seuls les gestes nés
     * dedans lui reviennent. Bord INCONNU ⇒ tout lui revient (un glissé inerte vaut mieux qu'un axe collé).
     */
    fun yieldsToScrollableSurface(hasScrollableSurface: Boolean, surfaceTopY: Float?, dragStartY: Float): Boolean {
        if (!hasScrollableSurface) return false
        val top = surfaceTopY ?: return true
        return dragStartY >= top
    }
}

/**
 * Le suivi d'un glissé du lecteur — iOS `StoryReaderDragTracker` : l'axe pris, l'état des surfaces PHOTOGRAPHIÉ au
 * moment où l'axe vertical se décide, et la purge qui répare un relâchement jamais livré.
 *
 * La pause pendant le glissé est un ÉTAT ([isInFlight]), jamais un événement : un événement a besoin d'un symétrique
 * que la plateforme saute quand un autre détecteur emporte la séquence, et la story resterait figée.
 * Les distances sont en dp.
 */
internal class StoryReaderDragTracker {
    var axis: StoryDragAxis = StoryDragAxis.Undecided
        private set

    private var hadActiveFeatureAtStart = false

    /** Le toucher qui commence a déjà refermé une surface : le glissé qui suit ne doit pas fermer la story. */
    var featureConsumedByTouch: Boolean = false

    var owner: StoryDragOwner = StoryDragOwner.Reader

    /** Jeton de purge de l'état PRIVÉ des autres couches de toucher, incrémenté par [reset] sur les chemins non nominaux. */
    var resetToken: Int = 0
        private set

    val isInFlight: Boolean get() = axis != StoryDragAxis.Undecided

    /** Une surface était ouverte au départ du glissé en cours (photo de l'axe vertical, ou toucher qui l'a refermée). */
    val hadActiveFeature: Boolean get() = hadActiveFeatureAtStart || featureConsumedByTouch

    /**
     * Décide l'axe au premier mouvement significatif puis le garde. La cession horizontale est consultée AVANT de
     * s'engager à l'horizontale : c'est le seul instant où la course entre deux détecteurs peut être perdue.
     */
    fun track(dx: Float, dy: Float, featureAtStart: Boolean, horizontalYields: Boolean): StoryDragAxis {
        if (axis != StoryDragAxis.Undecided) return axis
        if (abs(dx) > abs(dy) + AXIS_LEAD_DP) {
            if (horizontalYields) return axis
            axis = StoryDragAxis.Horizontal
        } else if (abs(dy) > abs(dx) + AXIS_LEAD_DP) {
            axis = StoryDragAxis.Vertical
            hadActiveFeatureAtStart = featureAtStart
        }
        return axis
    }

    /** Termine le glissé : son axe, et si une surface était ouverte à son départ. Les deux photos ne valent que pour lui. */
    fun finish(): Ended {
        val ended = Ended(axis, hadActiveFeature)
        clearGesture()
        return ended
    }

    /** Le filet anti-état-collé. */
    fun reset() {
        clearGesture()
        owner = StoryDragOwner.Reader
        resetToken++
    }

    /** Un changement de slide libère un axe collé sans toucher aux photos d'un toucher vivant. */
    fun releaseAxis() {
        axis = StoryDragAxis.Undecided
    }

    private fun clearGesture() {
        axis = StoryDragAxis.Undecided
        hadActiveFeatureAtStart = false
        featureConsumedByTouch = false
    }

    data class Ended(val axis: StoryDragAxis, val hadActiveFeature: Boolean)

    companion object {
        /** De combien un axe doit dominer l'autre avant que le glissé s'y engage, en dp. */
        const val AXIS_LEAD_DP: Float = 8f

        /** Course minimale avant tout suivi, en dp. */
        const val MINIMUM_DISTANCE_DP: Float = 15f
    }
}
