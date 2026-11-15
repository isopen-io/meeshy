package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * **La hauteur d'une feuille ancrée** (K15) : épouse son contenu, prend une fraction fixe de la place disponible, ou
 * repose sur l'un de plusieurs crans. Toute hauteur est plafonnée par [MeeshyAnchoredSheetMetrics.ceiling] : jamais plus
 * de 62 % de la place, et au moins 120 dp gardés au-dessus d'elle. Miroir de `MeeshyAnchoredSheetHeight` (iOS).
 */
public sealed interface MeeshyAnchoredSheetHeight {
    /** Épouse le contenu, plafonnée. */
    public data object Content : MeeshyAnchoredSheetHeight

    /** Une part de la place disponible (0…1), plafonnée. */
    @Immutable
    public data class Fraction(public val part: Float) : MeeshyAnchoredSheetHeight

    /** Des parts de la place disponible ; [initial] est l'indice, dans la liste FOURNIE, du cran d'ouverture. */
    @Immutable
    public data class Detents(public val parts: List<Float>, public val initial: Int = 0) : MeeshyAnchoredSheetHeight

    public companion object {
        public val Compact: MeeshyAnchoredSheetHeight = Fraction(MeeshyAnchoredSheetMetrics.COMPACT_FRACTION)
        public val Regular: MeeshyAnchoredSheetHeight = Fraction(MeeshyAnchoredSheetMetrics.REGULAR_FRACTION)
        public val Tall: MeeshyAnchoredSheetHeight = Fraction(MeeshyAnchoredSheetMetrics.MAXIMUM_FRACTION)
    }
}

/** Le matériau d'une feuille ancrée : celui du thème, ou l'indigo sombre forcé du composer. */
public enum class MeeshyAnchoredSheetSurface {
    Theme,
    Dark,
}

/** Ce que devient un toucher hors de la feuille : il la ferme, ou il traverse jusqu'à l'hôte. */
public enum class MeeshyAnchoredSheetOutside {
    Dismisses,
    PassesThrough,
}

/** Où une feuille se pose au relâcher d'un glissé. */
public sealed interface MeeshyAnchoredSheetSettlement {
    public data object Dismiss : MeeshyAnchoredSheetSettlement

    @Immutable
    public data class Rest(public val index: Int) : MeeshyAnchoredSheetSettlement
}

/**
 * Le mouvement d'entrée, de sortie et de retour. « Réduire les animations » : tout est immédiat, le doigt déplace
 * toujours la feuille. [response] et [dampingFraction] sont ceux d'iOS ; [stiffness] est la raideur Compose qui leur
 * correspond.
 */
@Immutable
public data class MeeshyAnchoredSheetMotion(
    public val isImmediate: Boolean,
    public val response: Float,
    public val dampingFraction: Float,
    public val durationMilliseconds: Int,
) {
    /** `(2π / response)²` : la raideur du ressort dont la période propre est [response]. */
    public val stiffness: Float get() = (TWO_PI / response).let { it * it }

    private companion object {
        const val TWO_PI: Float = 6.2831855f
    }
}

/**
 * **Ce que la feuille montre autour de son contenu, et ce qu'elle dit au lecteur d'écran** (loi 13) : aucune poignée sans
 * glissé, aucune rangée d'en-tête sans titre ni fin d'en-tête, aucun ✕ quand la fin d'en-tête le remplace ou que son nom
 * est absent, aucun voile hors de la fermeture au toucher extérieur. Miroir de `MeeshyAnchoredSheetChrome` (iOS).
 */
@Immutable
public data class MeeshyAnchoredSheetChrome(
    public val showsHandle: Boolean,
    /** La poignée est un contrôle réglable (« Hauteur de la feuille ») : il faut des crans. */
    public val handleIsAdjustable: Boolean,
    public val showsHeader: Boolean,
    public val showsClose: Boolean,
    public val showsScrim: Boolean,
    /** Un toucher hors de la feuille la ferme, et la feuille est une fenêtre modale. */
    public val isModal: Boolean,
) {
    public companion object {
        public fun resolve(
            hasTitle: Boolean,
            hasTrailing: Boolean,
            hasCloseLabel: Boolean,
            showsHandle: Boolean,
            isDragDismissEnabled: Boolean,
            hasDetents: Boolean,
            outside: MeeshyAnchoredSheetOutside,
            scrim: Boolean,
        ): MeeshyAnchoredSheetChrome {
            val handle = showsHandle && isDragDismissEnabled
            val modal = outside == MeeshyAnchoredSheetOutside.Dismisses
            return MeeshyAnchoredSheetChrome(
                showsHandle = handle,
                handleIsAdjustable = handle && hasDetents,
                showsHeader = hasTitle || hasTrailing,
                showsClose = hasTitle && !hasTrailing && hasCloseLabel,
                showsScrim = scrim && modal,
                isModal = modal,
            )
        }
    }
}

/**
 * Les hauteurs d'une feuille à un instant : sa place au repos, celle du cran le plus haut sur laquelle elle est posée, et
 * ce qu'elle laisse à glisser vers le haut. Miroir de `MeeshyAnchoredSheetLayout` (iOS).
 */
@Immutable
public data class MeeshyAnchoredSheetLayout(
    public val rests: List<Float>,
    public val index: Int,
    public val hasDetents: Boolean,
) {
    public val rest: Float get() = rests.getOrElse(index) { 0f }
    public val layoutHeight: Float get() = rests.lastOrNull() ?: 0f
    public val restOffset: Float get() = layoutHeight - rest

    public companion object {
        public fun resolve(
            height: MeeshyAnchoredSheetHeight,
            content: Float?,
            available: Float,
            maximumFraction: Float,
            detentIndex: Int,
        ): MeeshyAnchoredSheetLayout {
            if (height is MeeshyAnchoredSheetHeight.Detents) {
                val rests = MeeshyAnchoredSheetMetrics.detentHeights(height.parts, available, maximumFraction)
                return MeeshyAnchoredSheetLayout(
                    rests = rests,
                    index = detentIndex.coerceIn(0, max(0, rests.size - 1)),
                    hasDetents = rests.size > 1,
                )
            }
            val rest = MeeshyAnchoredSheetMetrics.height(height, content ?: 0f, available, maximumFraction)
            return MeeshyAnchoredSheetLayout(rests = listOf(rest), index = 0, hasDetents = false)
        }
    }
}

/**
 * **La loi pure d'une feuille ancrée, lue par les trois plateformes** (K15) : hauteurs, plafond, fermeture au glissé,
 * crans, place publiée et mouvement. Toute valeur propre vit ici et nulle part ailleurs. Les vecteurs de parité
 * (`docs/product/kit/K15-MeeshyAnchoredSheet.vectors.json`) la fixent pour iOS, Android et le web. Les longueurs sont en
 * dp (ou dans l'unité que l'hôte mesure : la loi est homogène). Miroir de `MeeshyAnchoredSheetMetrics` (iOS).
 */
public object MeeshyAnchoredSheetMetrics {

    public const val COMPACT_FRACTION: Float = 0.30f
    public const val REGULAR_FRACTION: Float = 0.50f
    public const val MAXIMUM_FRACTION: Float = 0.62f

    /** Ce que la feuille laisse toujours visible au-dessus d'elle. */
    public const val RESERVED_ABOVE: Float = 120f

    /** Le quart de sa hauteur, ou la moitié prédite : au-delà, un glissé ferme. */
    public const val DISMISS_TRANSLATION_FRACTION: Float = 0.25f
    public const val DISMISS_PREDICTED_FRACTION: Float = 0.5f

    public const val HANDLE_WIDTH: Float = 36f
    public const val HANDLE_HEIGHT: Float = 5f
    public const val HANDLE_OPACITY_DARK: Float = 0.35f
    public const val HANDLE_OPACITY_THEME: Float = 0.5f
    public const val SHADOW_RADIUS: Float = 15f
    public const val SHADOW_Y_OFFSET: Float = -12f
    public const val SHADOW_OPACITY: Float = 0.4f
    public const val SCRIM_OPACITY: Float = 0.4f

    public const val SPRING_RESPONSE: Float = 0.32f
    public const val SPRING_DAMPING: Float = 0.88f
    public const val DURATION_MILLISECONDS: Int = 280

    /**
     * Android seulement (fiche K15 §4, conservé du code) : le reste d'un défilement du contenu vers le bas ferme aussi la
     * feuille, au-delà de [PULL_DISMISS_DP] tirés, ou sur un jet d'au moins [FLING_DISMISS_DP_PER_SECOND].
     */
    public const val PULL_DISMISS_DP: Float = 120f
    public const val FLING_DISMISS_DP_PER_SECOND: Float = 900f

    /** Android seulement : la fin PRÉDITE d'un glissé de la poignée, à la vitesse du doigt, un quart de seconde plus tard. */
    public const val PREDICTION_SECONDS: Float = 0.25f

    // region Hauteur

    /** Le plafond : [maximumFraction] de la place, en gardant [RESERVED_ABOVE] au-dessus. Jamais négatif. */
    public fun ceiling(available: Float, maximumFraction: Float = MAXIMUM_FRACTION): Float {
        if (!available.isFinite() || available <= 0f) return 0f
        return max(0f, min(available * max(0f, maximumFraction), available - RESERVED_ABOVE))
    }

    /** La hauteur AU REPOS de la feuille : celle du cran initial pour des crans. */
    public fun height(
        height: MeeshyAnchoredSheetHeight,
        content: Float,
        available: Float,
        maximumFraction: Float = MAXIMUM_FRACTION,
    ): Float {
        val cap = ceiling(available, maximumFraction)
        return when (height) {
            MeeshyAnchoredSheetHeight.Content -> if (content.isFinite()) min(max(0f, content), cap) else cap
            is MeeshyAnchoredSheetHeight.Fraction -> clamped(height.part, available, cap)
            is MeeshyAnchoredSheetHeight.Detents -> {
                val rests = detentHeights(height.parts, available, maximumFraction)
                if (rests.isEmpty()) 0f else rests[min(initialDetentIndex(height.parts, height.initial), rests.size - 1)]
            }
        }
    }

    /** Les hauteurs des crans, ordonnées de la plus basse à la plus haute. */
    public fun detentHeights(parts: List<Float>, available: Float, maximumFraction: Float = MAXIMUM_FRACTION): List<Float> {
        val cap = ceiling(available, maximumFraction)
        return parts.map { clamped(it, available, cap) }.sorted()
    }

    /** L'indice du cran d'ouverture dans la liste ORDONNÉE des crans. */
    public fun initialDetentIndex(parts: List<Float>, initial: Int): Int {
        if (parts.isEmpty()) return 0
        val wanted = parts[initial.coerceIn(0, parts.size - 1)]
        return parts.sorted().indexOf(wanted).coerceAtLeast(0)
    }

    private fun clamped(part: Float, available: Float, cap: Float): Float {
        if (!available.isFinite() || available <= 0f || !part.isFinite()) return 0f
        return min(max(0f, available * part), cap)
    }

    // endregion

    // region Glissé

    /** Le glissé ferme au quart de la hauteur parcourue, ou si sa fin prédite passe la moitié. */
    public fun dismisses(translation: Float, predictedEnd: Float, height: Float): Boolean {
        if (height <= 0f) return translation > 0f
        return translation > height * DISMISS_TRANSLATION_FRACTION || predictedEnd > height * DISMISS_PREDICTED_FRACTION
    }

    /** Le décalage que suit le doigt : jamais au-dessus du repos, sauf [upwardRoom] (la place qu'un cran plus haut offre). */
    public fun dragOffset(translation: Float, upwardRoom: Float = 0f): Float = max(-max(0f, upwardRoom), translation)

    /**
     * Le relâcher : sous le cran le plus bas, la loi de fermeture s'applique ; sinon la feuille repose sur le cran le plus
     * proche de l'endroit que la vitesse désigne.
     */
    public fun settle(translation: Float, predictedEnd: Float, currentIndex: Int, rests: List<Float>): MeeshyAnchoredSheetSettlement {
        val lowest = rests.firstOrNull() ?: return MeeshyAnchoredSheetSettlement.Dismiss
        val index = currentIndex.coerceIn(0, rests.size - 1)
        val gap = rests[index] - lowest
        val below = translation - gap
        if (below > 0f && dismisses(below, predictedEnd - gap, lowest)) return MeeshyAnchoredSheetSettlement.Dismiss
        return MeeshyAnchoredSheetSettlement.Rest(nearest(rests[index] - predictedEnd, rests))
    }

    private fun nearest(target: Float, rests: List<Float>): Int =
        rests.indices.minByOrNull { abs(rests[it] - target) } ?: 0

    /** La fin prédite d'un glissé : où le doigt serait [PREDICTION_SECONDS] plus tard, à sa vitesse du relâcher. */
    public fun predictedEnd(translation: Float, velocity: Float): Float = translation + velocity * PREDICTION_SECONDS

    /** Android : le reste d'un défilement tiré vers le bas ferme la feuille, tiré assez loin ou jeté assez vite. */
    public fun pullDismisses(pulledDp: Float, flingDpPerSecond: Float): Boolean =
        pulledDp >= PULL_DISMISS_DP || flingDpPerSecond >= FLING_DISMISS_DP_PER_SECOND

    // endregion

    // region Place publiée

    /** Le haut de la feuille AU REPOS, hors glissé : l'hôte ne se recadre pas à chaque image du doigt. */
    public fun restingTop(containerMaxY: Float, height: Float): Float = containerMaxY - height

    // endregion

    // region Mouvement et encre

    public fun motion(reduceMotion: Boolean): MeeshyAnchoredSheetMotion = MeeshyAnchoredSheetMotion(
        isImmediate = reduceMotion,
        response = SPRING_RESPONSE,
        dampingFraction = SPRING_DAMPING,
        durationMilliseconds = if (reduceMotion) 0 else DURATION_MILLISECONDS,
    )

    /** La valeur dite de la poignée à crans : « agrandie » sur le cran le plus haut, « réduite » sinon. */
    public fun isExpanded(detentIndex: Int, detentCount: Int): Boolean = detentCount > 1 && detentIndex >= detentCount - 1

    public fun handleOpacity(surface: MeeshyAnchoredSheetSurface): Float =
        if (surface == MeeshyAnchoredSheetSurface.Dark) HANDLE_OPACITY_DARK else HANDLE_OPACITY_THEME

    // endregion
}
