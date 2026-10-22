package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Message-state colors — port of the iOS "États d'un message dans le fil" block of
 * `MeeshyColors.swift` (#7599), derived to `packages/design-tokens/ios.css` (`--ios-state-*`).
 *
 * ONE color code for both platforms: a state reads by its tint before any text, and the text only
 * serves the screen reader. Each tint says ONE state — the failure red no longer paints an
 * ephemeral message, the indigo no longer paints a blurred one — which is why the values are
 * literals here rather than aliases of the palette: moving a palette hue must never silently
 * re-colour a state.
 */
object MeeshyMessageStateColors {
    /** View-once, not opened yet — FILLED glyph. */
    val ViewOnce = Color(0xFF6366F1)

    /** View-once, opened — OUTLINE glyph, muted (iOS #7579). */
    val Opened = Color(0xFF9CA3AF)

    /** Ephemeral: the flame, and the countdown of the last minute. */
    val Ephemeral = Color(0xFFF97316)

    /** Blurred, concealed. */
    val Concealed = Color(0xFF6B7280)

    /** Send failure. */
    val Failed = Color(0xFFEF4444)

    /** The same tints as hex strings (iOS `state*Hex`), pinned equal by `MeeshyTokenParityTest`. */
    object Hex {
        const val ViewOnce = "6366F1"
        const val Opened = "9CA3AF"
        const val Ephemeral = "F97316"
        const val Concealed = "6B7280"
        const val Failed = "EF4444"
    }
}
