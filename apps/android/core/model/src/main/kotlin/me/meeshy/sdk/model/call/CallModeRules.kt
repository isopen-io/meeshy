package me.meeshy.sdk.model.call

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * **LE CARROUSEL D'UN MODE D'APPEL** — miroir de iOS `CallModeCarouselRule` (`CallModeRules.swift`) : échelle et
 * opacité du centre et des voisins, marge qui centre le premier élément, pas « suivant / précédent » borné, et
 * les règles qui tiennent le choix HORS du doigt (le centre suit le doigt, le choix ne part qu'au repos).
 */
public object CallModeCarouselRule {
    public const val SELECTED_SCALE: Float = 1f
    public const val NEIGHBOUR_SCALE: Float = 0.78f
    public const val SELECTED_OPACITY: Float = 1f
    public const val NEIGHBOUR_OPACITY: Float = 0.6f

    /** Un pouce posé à côté d'un élément défile quand même : la bande de glissé ne descend jamais sous 88 dp. */
    public const val MINIMUM_TRACK_DP: Float = 88f

    public fun scale(isSelected: Boolean): Float = if (isSelected) SELECTED_SCALE else NEIGHBOUR_SCALE

    public fun opacity(isSelected: Boolean): Float = if (isSelected) SELECTED_OPACITY else NEIGHBOUR_OPACITY

    public fun sideInset(containerWidth: Float, itemWidth: Float): Float = max(0f, (containerWidth - itemWidth) / 2f)

    public fun trackHeight(itemHeight: Float): Float = max(itemHeight, MINIMUM_TRACK_DP)

    public fun verticalMargin(itemHeight: Float): Float = (trackHeight(itemHeight) - itemHeight) / 2f

    /** Le pas de « suivant / précédent » : borné, sans reboucler ; une sélection inconnue rend le premier. */
    public fun <T> stepping(selection: T, items: List<T>, by: Int): T {
        val index = items.indexOf(selection)
        if (index < 0) return items.firstOrNull() ?: selection
        return items[(index + by).coerceIn(0, items.lastIndex)]
    }

    /** Le CHOIX (l'effet envoyé à l'autre) ne part qu'au repos. */
    public fun commits(isInteracting: Boolean): Boolean = !isInteracting

    /** Un défilement programmé ne se lance jamais sous le doigt. */
    public fun mayFollowSelection(isInteracting: Boolean): Boolean = !isInteracting

    /** Après un toucher lointain, le trajet ne choisit personne : il n'est posé qu'une fois la cible au centre. */
    public fun <T> settled(nearest: T?, target: T?): Boolean = target == null || nearest == target

    /** L'élément au centre déduit du décalage : éléments de même largeur, piste dont la marge centre le premier. */
    public fun nearestIndex(offset: Float, itemWidth: Float, spacing: Float, count: Int): Int? {
        val step = itemWidth + spacing
        if (count <= 0 || step <= 0f || !offset.isFinite()) return null
        return (offset / step).roundToInt().coerceIn(0, count - 1)
    }
}

/**
 * #17814 · C1.12 — la barre et le carrousel du Montage montent depuis le bas et y redescendent (transformation et
 * opacité), sur une couche qui fond. Effets garde le seul fondu de sa couche : la loi 17 l'excepte (« Effets emprunte
 * au composer », loi 9). « Réduire les animations » ne laisse que le fondu court. Miroir de iOS `CallModeChromeMotion`.
 */
public object CallModeChromeMotion {
    public fun risesFromBottom(mode: CallScreenMode, reduceMotion: Boolean): Boolean = when (mode) {
        CallScreenMode.Montage -> !reduceMotion
        CallScreenMode.Effects -> false
    }
}

/**
 * L'état du défilement d'un carrousel (iOS `CallModeCarouselMotion`) : qui le fait bouger — le doigt, ou le
 * carrousel qui amène au centre un élément touché — et ce que le repos choisit. Immuable : chaque événement rend
 * le nouvel état.
 */
public data class CallModeCarouselMotion<T>(
    val settling: T? = null,
    val isInteracting: Boolean = false,
) {
    /** Le centre a changé. Pendant un trajet programmé seule l'arrivée compte ; sinon c'est le doigt (si inféré). */
    public fun moved(nearest: T?, infersInteraction: Boolean): CallModeCarouselMotion<T> {
        if (settling != null) {
            return if (CallModeCarouselRule.settled(nearest, settling)) copy(settling = null) else this
        }
        return if (infersInteraction) copy(isInteracting = true) else this
    }

    /** Un doigt qui glisse reprend la main sur le trajet en cours. */
    public fun userScrolling(scrolling: Boolean): CallModeCarouselMotion<T> =
        copy(isInteracting = scrolling, settling = if (scrolling) null else settling)

    /** Un toucher reconnu : le doigt ne défile pas. */
    public fun tapped(): CallModeCarouselMotion<T> = copy(isInteracting = false, settling = null)

    /** Amener la sélection au centre si le doigt le permet ; la cible est retenue. Rend (état, faut-il défiler). */
    public fun follows(selection: T, nearest: T?): Pair<CallModeCarouselMotion<T>, Boolean> {
        if (!CallModeCarouselRule.mayFollowSelection(isInteracting) || nearest == selection) return this to false
        return copy(settling = selection) to true
    }

    /** Le défilement s'arrête : l'élément au centre est choisi, sauf au milieu d'un trajet programmé. */
    public fun rests(nearest: T?, selection: T): Pair<CallModeCarouselMotion<T>, T?> {
        val cleared = copy(settling = null)
        val chosen = nearest?.takeIf {
            CallModeCarouselRule.commits(isInteracting) && CallModeCarouselRule.settled(nearest, settling) && it != selection
        }
        return cleared to chosen
    }
}
