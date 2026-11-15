package me.meeshy.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Type sizes — strict 1:1 with iOS `MeeshyFont.*Size` (DesignTokens.swift), from the
 * 9 `micro` caption to the 34 `largeTitle`. Sizes are in `sp`, so text grows with the
 * system font size exactly like iOS Dynamic Type (see [meeshyText]).
 *
 * The names drop iOS's `Size` suffix: `MeeshyFont.bodySize` is [body].
 */
public object MeeshyFontSize {
    public val micro: TextUnit = 9.sp
    public val caption: TextUnit = 10.sp
    public val footnote: TextUnit = 11.sp
    public val small: TextUnit = 12.sp
    public val subhead: TextUnit = 13.sp
    public val label: TextUnit = 14.sp
    public val body: TextUnit = 15.sp
    public val callout: TextUnit = 16.sp
    public val headline: TextUnit = 17.sp
    public val subtitle: TextUnit = 18.sp
    public val title3: TextUnit = 20.sp
    public val title: TextUnit = 22.sp
    public val display: TextUnit = 28.sp
    public val largeTitle: TextUnit = 34.sp

    /** Every step, ascending. */
    public val scale: List<TextUnit> = listOf(
        micro, caption, footnote, small, subhead, label, body, callout, headline, subtitle,
        title3, title, display, largeTitle,
    )
}

/** Icon sizes — strict 1:1 with iOS `MeeshyIconSize` (DesignTokens.swift). */
public object MeeshyIconSize {
    public val xxs: Dp = 10.dp
    public val xs: Dp = 12.dp
    public val sm: Dp = 14.dp
    public val md: Dp = 16.dp
    public val lg: Dp = 18.dp
    public val xl: Dp = 20.dp
    public val xxl: Dp = 22.dp
    public val xxxl: Dp = 28.dp
    public val hero: Dp = 48.dp

    /** Every step, ascending. */
    public val scale: List<Dp> = listOf(xxs, xs, sm, md, lg, xl, xxl, xxxl, hero)
}

/**
 * Control sizes — strict 1:1 with iOS `MeeshyControlSize` (DesignTokens.swift).
 *
 * [tapTarget] is iOS's 44pt Apple HIG minimum. Android's floor is the Material
 * [minTouchTarget] of 48dp: an interactive target is never smaller than it, whatever
 * the glyph it carries.
 */
public object MeeshyControlSize {
    public val small: Dp = 28.dp
    public val compact: Dp = 32.dp
    public val regular: Dp = 36.dp
    public val large: Dp = 40.dp
    public val tapTarget: Dp = 44.dp
    public val buttonHeight: Dp = 52.dp

    /** Android-only: the 48dp minimum touch target (Material, TalkBack). */
    public val minTouchTarget: Dp = 48.dp

    /** Every iOS step, ascending ([minTouchTarget] is Android-only and excluded). */
    public val scale: List<Dp> = listOf(small, compact, regular, large, tapTarget, buttonHeight)
}

/** Border widths — strict 1:1 with iOS `MeeshyBorder` (DesignTokens.swift). */
public object MeeshyBorder {
    public val hairline: Dp = 0.5.dp
    public val regular: Dp = 1.dp
    public val emphasis: Dp = 1.5.dp
    public val strong: Dp = 2.dp

    /** Every step, ascending. */
    public val scale: List<Dp> = listOf(hairline, regular, emphasis, strong)
}

/** Opacities (alpha, 0..1) — strict 1:1 with iOS `MeeshyOpacity` (DesignTokens.swift). */
public object MeeshyOpacity {
    public const val faint: Float = 0.04f
    public const val subtle: Float = 0.08f
    public const val light: Float = 0.15f
    public const val medium: Float = 0.3f
    public const val strong: Float = 0.5f
    public const val heavy: Float = 0.7f
    public const val intense: Float = 0.85f

    /** Every step, ascending. */
    public val scale: List<Float> = listOf(faint, subtle, light, medium, strong, heavy, intense)
}

/**
 * One shadow of the scale: a black shadow of [opacity] alpha, blurred over [radius],
 * pushed [y] down — the `(opacity:, radius:, y:)` tuples of iOS `MeeshyShadow`.
 */
@Immutable
public data class MeeshyShadowSpec(
    val opacity: Float,
    val radius: Dp,
    val y: Dp,
)

/** Shadow scale — strict 1:1 with iOS `MeeshyShadow` (DesignTokens.swift). */
public object MeeshyShadow {
    public val subtle: MeeshyShadowSpec = MeeshyShadowSpec(opacity = 0.1f, radius = 4.dp, y = 2.dp)
    public val medium: MeeshyShadowSpec = MeeshyShadowSpec(opacity = 0.2f, radius = 8.dp, y = 4.dp)
    public val strong: MeeshyShadowSpec = MeeshyShadowSpec(opacity = 0.3f, radius = 12.dp, y = 6.dp)
}
