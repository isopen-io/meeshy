package me.meeshy.ui.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing scale — strict 1:1 with iOS `MeeshySpacing` (DesignTokens.swift).
 *
 * The scale is NOT a strict 4dp grid: iOS interleaves the half steps `xxs` 2,
 * `xsPlus` 6, `smPlus` 10 and `mdPlus` 14 between the 4dp steps, and the screens
 * ported from it use them. Components and screens use these names rather than raw
 * `dp` literals so spacing stays consistent and re-tunable in one place.
 */
public object MeeshySpacing {
    public val none: Dp = 0.dp
    public val xxs: Dp = 2.dp
    public val xs: Dp = 4.dp
    public val xsPlus: Dp = 6.dp
    public val sm: Dp = 8.dp
    public val smPlus: Dp = 10.dp
    public val md: Dp = 12.dp
    public val mdPlus: Dp = 14.dp
    public val lg: Dp = 16.dp
    public val xl: Dp = 20.dp
    public val xxl: Dp = 24.dp
    public val xxxl: Dp = 32.dp

    /** Every step, ascending — used to assert the scale's order and completeness in tests. */
    public val scale: List<Dp> = listOf(none, xxs, xs, xsPlus, sm, smPlus, md, mdPlus, lg, xl, xxl, xxxl)
}

/**
 * Corner-radius scale — strict 1:1 with iOS `MeeshyRadius` (DesignTokens.swift):
 * xxs 4, xs 8, sm 10, smPlus 12, md 14, lg 16, lgPlus 18, xl 20, xlPlus 22, xxl 24.
 * iOS's `full = .infinity` maps to [pill].
 */
public object MeeshyRadius {
    public val xxs: Dp = 4.dp
    public val xs: Dp = 8.dp
    public val sm: Dp = 10.dp
    public val smPlus: Dp = 12.dp
    public val md: Dp = 14.dp
    public val lg: Dp = 16.dp
    public val lgPlus: Dp = 18.dp
    public val xl: Dp = 20.dp
    public val xlPlus: Dp = 22.dp
    public val xxl: Dp = 24.dp

    /** Fully rounded — pills, circular containers (iOS `full`). */
    public val pill: Dp = 999.dp

    /** Every finite step, ascending ([pill] excluded). */
    public val scale: List<Dp> = listOf(xxs, xs, sm, smPlus, md, lg, lgPlus, xl, xlPlus, xxl)
}
