package me.meeshy.ui.theme

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Reading widths — strict 1:1 with iOS `MeeshyLayout` (DesignTokens.swift).
 */
public object MeeshyLayout {
    /** The column of a form: sign-in, sign-up, password, two-factor. */
    public val formMaxWidth: Dp = 600.dp

    /** The column of reading content: feeds, profiles, detail screens on a tablet. */
    public val contentMaxWidth: Dp = 700.dp
}

/**
 * Lays the content out in the centered column of a form — the port of iOS
 * `iPadFormWidth()`.
 *
 * The element takes every dp available up to [maxWidth], then centers itself in
 * what is left: on a tablet the form holds the middle of the screen like the
 * sign-in page, on a phone (narrower than the bound) nothing moves.
 *
 * Place it AFTER what must stay full-screen — background, insets, the scroll
 * container, so a swipe in the margins still scrolls — and BEFORE the content's
 * own gutters.
 */
public fun Modifier.formColumnWidth(maxWidth: Dp = MeeshyLayout.formMaxWidth): Modifier =
    centeredColumn(maxWidth)

/**
 * Lays reading content out in a centered column of at most [maxWidth] (700dp, iOS
 * `MeeshyLayout.contentMaxWidth`) — the same mechanism as [formColumnWidth], for
 * screens that read rather than ask: wider than a form, still bounded on a tablet,
 * a no-op on a phone.
 */
public fun Modifier.contentColumnWidth(maxWidth: Dp = MeeshyLayout.contentMaxWidth): Modifier =
    centeredColumn(maxWidth)

private fun Modifier.centeredColumn(maxWidth: Dp): Modifier =
    this
        .fillMaxWidth()
        .wrapContentWidth(Alignment.CenterHorizontally)
        .widthIn(max = maxWidth)
        .fillMaxWidth()
