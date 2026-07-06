package me.meeshy.ui.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing scale — a strict 4dp grid (charte graphique §13.6). Components and
 * screens use these names rather than raw `dp` literals so spacing stays
 * consistent and re-tunable in one place.
 */
public object MeeshySpacing {
    public val none: Dp = 0.dp
    public val xs: Dp = 4.dp
    public val sm: Dp = 8.dp
    public val md: Dp = 12.dp
    public val lg: Dp = 16.dp
    public val xl: Dp = 20.dp
    public val xxl: Dp = 24.dp
    public val xxxl: Dp = 32.dp

    /** Every step, ascending — used to assert the 4dp-grid invariant in tests. */
    public val scale: List<Dp> = listOf(none, xs, sm, md, lg, xl, xxl, xxxl)
}

/**
 * Corner-radius scale — strict 1:1 with iOS `MeeshyRadius` (DesignTokens.swift):
 * sm 10, md 14, lg 16, xl 20, xxl 24. iOS's `full = .infinity` maps to [pill].
 */
public object MeeshyRadius {
    public val sm: Dp = 10.dp
    public val md: Dp = 14.dp
    public val lg: Dp = 16.dp
    public val xl: Dp = 20.dp
    public val xxl: Dp = 24.dp

    /** Fully rounded — pills, circular containers (iOS `full`). */
    public val pill: Dp = 999.dp
}
