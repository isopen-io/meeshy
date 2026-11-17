package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import java.text.NumberFormat
import java.util.Locale

/** Les formes de l'échelle : des pastilles à compte, la pilule d'un niveau, des anneaux (K33). */
public enum class MeeshyCircleScaleForm { Dots, Pill, Rings }

/** Les tailles : `Compact` est la pilule de 26 (ou les crans de 12) dans une rangée. */
public enum class MeeshyCircleScaleSize { Compact, Regular, Large }

/** Le tic : `OnChange` suit un choix qui change de niveau, `None` laisse l'hôte jouer le sien. */
public enum class MeeshyCircleScaleHaptic { OnChange, None }

@Immutable
public data class MeeshyCircleScaleValues(
    val isRendered: Boolean,
    val levelCount: Int,
    val litLevel: Int?,
    val otherLevel: Int?,
    val dotDiameterDp: Float,
    val stepHeightDp: Float,
    val stepGapDp: Float,
    val pillHeightDp: Float,
    val ringStrokeDp: Float,
    val litRingStrokeDp: Float,
    val ringGapDp: Float,
    val glowRadiusDp: Float,
    val centerDiameterDp: Float,
    val markerDiameterDp: Float,
    val pressedScale: Float,
    val opacity: Float,
)

/**
 * **La recette de K33 en VALEURS** : la loi d'intensité (la SEULE source des six valeurs), les rangs bornés, les mesures de
 * chaque forme. Aucune couleur : une teinte unique, de plus en plus pleine ; l'hôte la remet, la recette la dose.
 * Miroir de `MeeshyCircleScaleRecipe` (iOS).
 */
public object MeeshyCircleScaleRecipe {
    public const val MINIMUM_LEVELS: Int = 2
    public const val MAXIMUM_LEVELS: Int = 8

    /** 100, 52, 32, 18, 8, contour : comptées depuis le plus haut niveau. */
    private val intensityFromTop: List<Float> = listOf(1f, 0.52f, 0.32f, 0.18f, 0.08f, 0f)

    /** Au-dessus de ce seuil le fond est assez plein pour une encre sombre. */
    private const val DARK_INK_THRESHOLD: Float = 0.52f
    private const val PRESSED_SCALE: Float = 0.92f
    private const val DISABLED_OPACITY: Float = 0.4f

    public fun resolve(
        count: Int,
        current: Int?,
        other: Int?,
        form: MeeshyCircleScaleForm,
        size: MeeshyCircleScaleSize,
        isPressed: Boolean,
        isEnabled: Boolean,
    ): MeeshyCircleScaleValues = MeeshyCircleScaleValues(
        isRendered = count in MINIMUM_LEVELS..MAXIMUM_LEVELS,
        levelCount = count,
        litLevel = clamped(current, count),
        otherLevel = if (form == MeeshyCircleScaleForm.Pill) null else clamped(other, count),
        dotDiameterDp = 58f,
        stepHeightDp = 12f,
        stepGapDp = 6f,
        pillHeightDp = pillHeight(size),
        ringStrokeDp = 1.5f,
        litRingStrokeDp = 4f,
        ringGapDp = 20f,
        glowRadiusDp = 26f,
        centerDiameterDp = 40f,
        markerDiameterDp = 48f,
        pressedScale = if (isPressed) PRESSED_SCALE else 1f,
        opacity = if (isEnabled) 1f else DISABLED_OPACITY,
    )

    private fun pillHeight(size: MeeshyCircleScaleSize): Float = when (size) {
        MeeshyCircleScaleSize.Compact -> 26f
        MeeshyCircleScaleSize.Regular -> 34f
        MeeshyCircleScaleSize.Large -> 44f
    }

    /**
     * **La loi d'intensité** : le même nom a la même intensité partout, que l'hôte passe cinq niveaux ou six. Trois niveaux
     * ou moins sautent un cran (100, 32, 8) pour garder l'écart.
     */
    public fun intensity(level: Int, of: Int): Float {
        val total = of.coerceAtLeast(1)
        val fromTop = total - 1 - level.coerceIn(0, total - 1)
        val index = if (total <= 3) fromTop * 2 else fromTop
        return intensityFromTop[index.coerceAtMost(intensityFromTop.lastIndex)]
    }

    /** Le rang ramené dans `0 until count` ; `null` reste `null` (« Mes cercles » n'allume rien). */
    public fun clamped(level: Int?, count: Int): Int? = level?.coerceIn(0, count.coerceAtLeast(1) - 1)

    /** L'encre se choisit à l'intensité du fond, pas à la teinte : sombre sur un fond plein. */
    public fun usesDarkInk(intensity: Float): Boolean = intensity >= DARK_INK_THRESHOLD

    /** Le tic suit un CHOIX qui change de niveau : un niveau remis par l'hôte ne fait rien vibrer. */
    public fun playsHaptic(haptic: MeeshyCircleScaleHaptic, chosen: Int, current: Int?, reduceMotion: Boolean): Boolean =
        haptic == MeeshyCircleScaleHaptic.OnChange && !reduceMotion && chosen != current

    /** Les comptes ne servent que s'ils ont la longueur des niveaux ; un compte négatif vaut zéro. */
    public fun validCounts(counts: List<Int>?, levelCount: Int): List<Int>? =
        counts?.takeIf { it.size == levelCount }?.map { it.coerceAtLeast(0) }

    /** Un compte écrit par la langue courante ; zéro s'écrit « 0 ». */
    public fun countText(count: Int, locale: Locale): String = NumberFormat.getIntegerInstance(locale).format(count.coerceAtLeast(0))
}
