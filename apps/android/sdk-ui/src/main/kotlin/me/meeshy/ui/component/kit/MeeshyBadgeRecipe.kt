package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.max
import me.meeshy.sdk.model.chrome.UnreadBadge

/** La surface d'une pastille (K41). Sur Android, [Glass] rend la surface tonale : le flou n'existe pas ici. */
public enum class MeeshyBadgeSurface { Glass, Tonal, Solid, Outline }

/** Un sens, pas une couleur : `err` dit un compte à rattraper, `ok` un acquis, `warn` un à-faire, `accent` « de cette personne ». */
public enum class MeeshyBadgeKind { Neutral, Accent, Ok, Warn, Err }

/** Les quatre hauteurs : 18 en coin, 22 en ligne, 28 sur une rangée ou une carte, 36 sur une bannière. */
public enum class MeeshyBadgeSize(public val heightDp: Int) { S18(18), S22(22), S28(28), S36(36) }

public enum class MeeshyBadgeShape { Capsule, Bubble }

/** La nature de ce que la pastille porte : elle règle la forme (disque, rayon 7) et la chasse des chiffres. */
public enum class MeeshyBadgeContentShape { Word, Digit, Count, Code, Ordinal, Time, Glyph }

/** La tête d'une pastille : rien, un glyphe, un point fixe ou un point pulsé. */
public sealed interface MeeshyBadgeLeading {
    public data object None : MeeshyBadgeLeading

    public data class Icon(val icon: androidx.compose.ui.graphics.vector.ImageVector) : MeeshyBadgeLeading

    public data object Dot : MeeshyBadgeLeading

    public data object LiveDot : MeeshyBadgeLeading
}

/** Le contenu d'une pastille : l'hôte traduit sa donnée en mot ou en nombre avant d'appeler, rien ici ne nomme un rang ni un cercle. */
public sealed interface MeeshyBadgeContent {
    public val shape: MeeshyBadgeContentShape

    public data class Label(val text: String) : MeeshyBadgeContent {
        override val shape: MeeshyBadgeContentShape get() = MeeshyBadgeContentShape.Word
    }

    /** [of] écrit le quota « 2 / 3 » ; sans lui, le compte seul, plafonné à [cap]. */
    public data class Count(val count: Int, val cap: Int = MeeshyBadgeCount.DEFAULT_CAP, val of: Int? = null) : MeeshyBadgeContent {
        override val shape: MeeshyBadgeContentShape
            get() = if (of == null && count in 1..9) MeeshyBadgeContentShape.Digit else MeeshyBadgeContentShape.Count
    }

    public data class Code(val text: String) : MeeshyBadgeContent {
        override val shape: MeeshyBadgeContentShape get() = MeeshyBadgeContentShape.Code
    }

    public data class Ordinal(val rank: Int) : MeeshyBadgeContent {
        override val shape: MeeshyBadgeContentShape get() = MeeshyBadgeContentShape.Ordinal
    }

    public data class Time(val text: String) : MeeshyBadgeContent {
        override val shape: MeeshyBadgeContentShape get() = MeeshyBadgeContentShape.Time
    }

    /** Un glyphe seul dans un disque : [MeeshyBadgeLeading.Icon] est alors obligatoire, et un nom dit aussi. */
    public data object Glyph : MeeshyBadgeContent {
        override val shape: MeeshyBadgeContentShape get() = MeeshyBadgeContentShape.Glyph
    }
}

/** La loi du compte : un compte à zéro ne rend rien et ne prend aucune place ; au-delà du plafond « 99+ », la voix dit le vrai nombre. */
public object MeeshyBadgeCount {
    public const val DEFAULT_CAP: Int = 99

    public fun isVisible(count: Int): Boolean = UnreadBadge.isVisible(count)

    /** Le texte rendu, ou `null` quand la pastille ne se monte pas. */
    public fun text(count: Int, cap: Int = DEFAULT_CAP): String? =
        if (isVisible(count)) (if (count > cap) "$cap+" else count.toString()) else null

    /** Le nombre lu par la voix : le VRAI compte, jamais le « 99+ » du dessin. */
    public fun spoken(count: Int): Int = UnreadBadge.spokenCount(count)

    /** Le quota « 2 / 3 », en chiffres à chasse fixe, jamais négatif. */
    public fun quota(count: Int, of: Int): String = "${count.coerceAtLeast(0)} / $of"
}

/** Ce que la recette rend : des valeurs, aucune vue. Miroir de `MeeshyBadgeRecipe.resolve` (iOS). */
@Immutable
public data class MeeshyBadgeValues(
    val surface: MeeshyBadgeSurface,
    val heightDp: Int,
    val textSp: Float,
    val glyphDp: Int,
    val horizontalPaddingDp: Int,
    val cornerRadiusDp: Int,
    val bubbleCornersDp: List<Int>?,
    val isDisc: Boolean,
    val fillsWidth: Boolean,
    val tonalAlpha: Float,
    val outlineDp: Float,
    val hasAccentBorder: Boolean,
    val opacity: Float,
    val isDesaturated: Boolean,
    val scale: Float,
    val hitDp: Int?,
    val isButton: Boolean,
    val usesTabularFigures: Boolean,
)

public object MeeshyBadgeRecipe {
    public const val FULL_RADIUS_DP: Int = 999
    public const val DOT_DP: Int = 6
    public const val LEADING_GAP_DP: Int = 5
    public const val CUTOUT_DP: Int = 3
    public const val TONAL_ALPHA: Float = 0.16f
    public const val OUTLINE_DP: Float = 1.5f
    public const val PRESSED_SCALE: Float = 0.94f
    public const val STALE_OPACITY: Float = 0.62f
    public const val DISABLED_OPACITY: Float = 0.4f
    private const val GLASS_RADIUS_DP: Int = 12
    private const val CODE_RADIUS_DP: Int = 7
    private const val MULTI_LINE_RADIUS_DP: Int = 14
    private const val BUBBLE_FAR_DP: Int = 16
    private const val BUBBLE_TAIL_DP: Int = 4
    private const val MIN_TARGET_DP: Int = 44

    /** Le décalage d'une pastille de coin : un quart de sa hauteur, vers l'extérieur de l'hôte. */
    public fun anchorOffsetDp(size: MeeshyBadgeSize): Float = size.heightDp / 4f

    public fun resolve(
        surface: MeeshyBadgeSurface,
        kind: MeeshyBadgeKind,
        size: MeeshyBadgeSize,
        shape: MeeshyBadgeShape,
        content: MeeshyBadgeContentShape,
        isMultiLine: Boolean,
        isCurrent: Boolean,
        isStale: Boolean,
        isInteractive: Boolean,
        isPressed: Boolean,
        isEnabled: Boolean,
    ): MeeshyBadgeValues {
        val effectiveSurface = if (surface == MeeshyBadgeSurface.Glass) MeeshyBadgeSurface.Tonal else surface
        val isDisc = !isMultiLine && (content == MeeshyBadgeContentShape.Digit || content == MeeshyBadgeContentShape.Glyph)
        return MeeshyBadgeValues(
            surface = effectiveSurface,
            heightDp = size.heightDp,
            textSp = textSp(size),
            glyphDp = glyphDp(size),
            horizontalPaddingDp = if (isDisc) 0 else horizontalPaddingDp(size),
            cornerRadiusDp = cornerRadiusDp(surface, content, isMultiLine),
            bubbleCornersDp = if (shape == MeeshyBadgeShape.Bubble) listOf(BUBBLE_FAR_DP, BUBBLE_FAR_DP, BUBBLE_FAR_DP, BUBBLE_TAIL_DP) else null,
            isDisc = isDisc,
            fillsWidth = isMultiLine,
            tonalAlpha = if (effectiveSurface == MeeshyBadgeSurface.Tonal) TONAL_ALPHA else 0f,
            outlineDp = if (effectiveSurface == MeeshyBadgeSurface.Outline) OUTLINE_DP else 0f,
            hasAccentBorder = isCurrent,
            opacity = opacity(isStale, isInteractive && !isEnabled),
            isDesaturated = isStale,
            scale = if (isInteractive && isEnabled && isPressed) PRESSED_SCALE else 1f,
            hitDp = if (isInteractive) max(size.heightDp, MIN_TARGET_DP) else null,
            isButton = isInteractive,
            usesTabularFigures = content == MeeshyBadgeContentShape.Digit || content == MeeshyBadgeContentShape.Count ||
                content == MeeshyBadgeContentShape.Time || content == MeeshyBadgeContentShape.Ordinal,
        )
    }

    private fun opacity(isStale: Boolean, isDisabled: Boolean): Float = when {
        isDisabled -> DISABLED_OPACITY
        isStale -> STALE_OPACITY
        else -> 1f
    }

    private fun textSp(size: MeeshyBadgeSize): Float = when (size) {
        MeeshyBadgeSize.S18 -> 10f
        MeeshyBadgeSize.S22 -> 11f
        MeeshyBadgeSize.S28 -> 12f
        MeeshyBadgeSize.S36 -> 12.5f
    }

    private fun horizontalPaddingDp(size: MeeshyBadgeSize): Int = when (size) {
        MeeshyBadgeSize.S18 -> 6
        MeeshyBadgeSize.S22 -> 8
        MeeshyBadgeSize.S28 -> 10
        MeeshyBadgeSize.S36 -> 12
    }

    private fun glyphDp(size: MeeshyBadgeSize): Int = when (size) {
        MeeshyBadgeSize.S18 -> 11
        MeeshyBadgeSize.S22 -> 13
        MeeshyBadgeSize.S28, MeeshyBadgeSize.S36 -> 16
    }

    private fun cornerRadiusDp(surface: MeeshyBadgeSurface, content: MeeshyBadgeContentShape, isMultiLine: Boolean): Int = when {
        isMultiLine -> MULTI_LINE_RADIUS_DP
        content == MeeshyBadgeContentShape.Code -> CODE_RADIUS_DP
        surface == MeeshyBadgeSurface.Glass -> GLASS_RADIUS_DP
        else -> FULL_RADIUS_DP
    }
}
