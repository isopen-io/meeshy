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

    /**
     * The alert red as INK on a LIGHT surface (iOS #9121): [Error] only holds
     * 2.77:1 on white — under the 3:1 of an icon. Same value as `--color-danger`
     * of the web light scheme. On a dark surface the ink stays [Error].
     */
    val ErrorInk = Color(0xFFC81E1E)

    // Currency (iOS #6427) — the SILVER of the Meesh coin: a slate grey with a hint of blue
    // reads as metal, where the amber of the reward entry reads as "claim me".
    val MeeshSilver = Color(0xFFA8B1BF)

    // Frank hues outside the brand (iOS #8877)
    val Blue500 = Color(0xFF3B82F6)
    val Orange500 = Color(0xFFF97316)
    val Amber500 = Color(0xFFF59E0B)

    // Composer plateau (iOS O6) — the two tints the indigo ramp does not cover. A plateau is a
    // background CHOSEN by the author, so it stays a token: contrast measures guard it.
    val PlateauNoir = Color(0xFF000000)
    val Violet950 = Color(0xFF2E1065)

    // Tile tints (iOS #8877)
    val TileCoral = Color(0xFFFF6B6B)
    val TileSaffron = Color(0xFFF8B500)
    val TileBlue = Color(0xFF3498DB)
    val TileAmethyst = Color(0xFF9B59B6)
    val TileSky = Color(0xFF45B7D1)
    val TileEmerald = Color(0xFF2ECC71)
    val TileTeal = Color(0xFF4ECDC4)
    val TileCyan = Color(0xFF08D9D6)
    val TileRose = Color(0xFFFF2E63)

    // Named planes (iOS #8877)
    val SurfaceDarkBase = Color(0xFF09090B)
    val SurfaceDarkDeep = Color(0xFF0F0D19)
    val SurfaceDarkRaised = Color(0xFF13111C)
    val SurfaceDarkInput = Color(0xFF16142A)
    val SurfaceLightRaised = Color(0xFFF8F7FF)
    val SurfaceLightMist = Color(0xFFFAFAFF)
    val SurfaceLightInput = Color(0xFFF5F3FF)

    /** Neutral accent of a blocked profile (iOS #8877). */
    val BlockedNeutral = Color(0xFF888888)

    // Feature accents (iOS "link management surfaces"): each one resolves to the indigo scale
    // or to a semantic color — no off-brand hex.
    val TrackingAccent = Indigo600
    val ShareAccent = Indigo400
    val CommunityAccent = Warning

    /**
     * Hex strings of the tokens iOS hands to `accentColor:` / `tint:` parameters. Android carries
     * the same strings through [hexColor] (see `DynamicColorGenerator`), so the two spellings of a
     * token must never drift: `MeeshyTokenParityTest` pins `hexColor(Hex.X) == X` for each pair.
     */
    object Hex {
        const val BrandPrimary = "6366F1"
        const val BrandDeep = "4338CA"
        const val Success = "34D399"
        const val Error = "F87171"
        const val ErrorInk = "C81E1E"
        const val Warning = "FBBF24"
        const val Info = "60A5FA"
        const val Neutral500 = "6B7280"
        const val Indigo50 = "EEF2FF"
        const val Indigo300 = "A5B4FC"
        const val Indigo400 = "818CF8"
        const val Indigo600 = "4F46E5"
        const val Indigo900 = "312E81"
        const val Purple500 = "A855F7"
        const val TrackingAccent = "4F46E5"
        const val ShareAccent = "818CF8"
        const val CommunityAccent = "FBBF24"
        const val MeeshSilver = "A8B1BF"
        const val Blue500 = "3B82F6"
        const val Orange500 = "F97316"
        const val Amber500 = "F59E0B"
        const val BlockedNeutral = "888888"
        const val TileCoral = "FF6B6B"
        const val TileSaffron = "F8B500"
        const val TileBlue = "3498DB"
        const val TileAmethyst = "9B59B6"
        const val TileSky = "45B7D1"
        const val TileEmerald = "2ECC71"
        const val TileTeal = "4ECDC4"
        const val TileCyan = "08D9D6"
        const val TileRose = "FF2E63"
    }

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
