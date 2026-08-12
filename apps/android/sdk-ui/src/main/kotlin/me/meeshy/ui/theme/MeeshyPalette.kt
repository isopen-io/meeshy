package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Meeshy brand palette — the Indigo identity.
 *
 * Strict 1:1 port of iOS `MeeshyColors.swift`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`). Every hex
 * here is a non-regression contract with iOS; see the parity plan §3
 * (`apps/android/tasks/ios-visual-parity-plan.md`). Do NOT re-hue any value.
 */
object MeeshyPalette {

    // Brand Indigo scale
    val Indigo50 = Color(0xFFEEF2FF)
    val Indigo100 = Color(0xFFE0E7FF)
    val Indigo200 = Color(0xFFC7D2FE)
    val Indigo300 = Color(0xFFA5B4FC)
    val Indigo400 = Color(0xFF818CF8)
    val Indigo500 = Color(0xFF6366F1) // primary
    val Indigo600 = Color(0xFF4F46E5)
    val Indigo700 = Color(0xFF4338CA) // primary deep
    val Indigo800 = Color(0xFF3730A3)
    val Indigo900 = Color(0xFF312E81)
    val Indigo950 = Color(0xFF1E1B4B)

    // Additional brand accents (iOS MeeshyColors "Additional Brand Accents")
    val Purple500 = Color(0xFFA855F7)
    val Purple600 = Color(0xFF8B5CF6)
    val Purple700 = Color(0xFFB24BF3)

    // Neutral scale
    val Neutral400 = Color(0xFF9CA3AF)
    val Neutral500 = Color(0xFF6B7280)
    val Neutral600 = Color(0xFF4B5563)

    // Semantic state colors
    val Success = Color(0xFF34D399)
    val Error = Color(0xFFF87171)
    val Warning = Color(0xFFFBBF24)
    val Info = Color(0xFF60A5FA)
    val ReadReceipt = Indigo400 // ✓✓ read receipts
    val PinnedBlue = Color(0xFF3B82F6)

    // Semantic tonal variants (gradient stops / theme-aware badges)
    val ErrorDark = Color(0xFF991B1B) // dark-mode unread badge background
    val ErrorSoft = Color(0xFFFCA5A5) // red-300 — light stop of error gradients
    val ErrorStrong = Color(0xFFEF4444) // red-500 — bold stop of error gradients
    val SuccessDeep = Color(0xFF10B981) // emerald-500 — bold stop of success gradients

    val White = Color(0xFFFFFFFF)
    val Ink = Color(0xFF09090B)

    // Signature gradients (color stops — see MeeshyColors gradient section).
    /** THE signature gradient — always Indigo500 → Indigo700. */
    val BrandGradient = listOf(Indigo500, Indigo700)
    val BrandGradientLight = listOf(Indigo400, Indigo500)
    val BrandGradientSubtle = listOf(Indigo300.copy(alpha = 0.3f), Indigo500.copy(alpha = 0.3f))

    /** Anneau des story rings — Indigo500 → Indigo400 → Indigo500. */
    val AvatarRingGradient = listOf(Indigo500, Indigo400, Indigo500)
    val AccentGradient = listOf(Indigo600, Indigo500, Indigo400)

    /**
     * Unread-count badge background, themed. Light: vivid red (`Error`);
     * dark: deep red (`ErrorDark`). Mirrors iOS `unreadBadgeBackground(isDark:)`.
     */
    fun unreadBadgeBackground(isDark: Boolean): Color = if (isDark) ErrorDark else Error
}
