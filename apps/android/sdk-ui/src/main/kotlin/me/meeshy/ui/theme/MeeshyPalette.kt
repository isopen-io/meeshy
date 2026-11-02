package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Meeshy brand palette — the Indigo identity.
 *
 * Strict 1:1 port of iOS `MeeshyColors.swift`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`). Every hex is GENERATED into
 * [MeeshyPaletteGenerated] by `packages/design-tokens/scripts/generate-android-from-ios.mjs`
 * (checked in `android.yml`); this object only gives the historical names. Never type a hex here.
 */
object MeeshyPalette {

    // Brand Indigo scale
    val Indigo50 = MeeshyPaletteGenerated.Indigo50
    val Indigo100 = MeeshyPaletteGenerated.Indigo100
    val Indigo200 = MeeshyPaletteGenerated.Indigo200
    val Indigo300 = MeeshyPaletteGenerated.Indigo300
    val Indigo400 = MeeshyPaletteGenerated.Indigo400
    val Indigo500 = MeeshyPaletteGenerated.Indigo500 // primary
    val Indigo600 = MeeshyPaletteGenerated.Indigo600
    val Indigo700 = MeeshyPaletteGenerated.Indigo700 // primary deep
    val Indigo800 = MeeshyPaletteGenerated.Indigo800
    val Indigo900 = MeeshyPaletteGenerated.Indigo900
    val Indigo950 = MeeshyPaletteGenerated.Indigo950

    // Additional brand accents (iOS MeeshyColors "Additional Brand Accents")
    val Purple500 = MeeshyPaletteGenerated.Purple500
    val Purple600 = MeeshyPaletteGenerated.Purple600
    val Purple700 = MeeshyPaletteGenerated.Purple700

    // Neutral scale
    val Neutral400 = MeeshyPaletteGenerated.Neutral400
    val Neutral500 = MeeshyPaletteGenerated.Neutral500
    val Neutral600 = MeeshyPaletteGenerated.Neutral600

    // Semantic state colors
    val Success = MeeshyPaletteGenerated.Success
    val Error = MeeshyPaletteGenerated.Error
    val Warning = MeeshyPaletteGenerated.Warning
    val Info = MeeshyPaletteGenerated.Info
    val ReadReceipt = Indigo400 // ✓✓ read receipts
    val PinnedBlue = MeeshyPaletteGenerated.PinnedBlue

    // Semantic tonal variants (gradient stops / theme-aware badges)
    val ErrorDark = MeeshyPaletteGenerated.ErrorDark // dark-mode unread badge background
    val ErrorSoft = MeeshyPaletteGenerated.ErrorSoft // red-300 — light stop of error gradients
    val ErrorStrong = MeeshyPaletteGenerated.ErrorStrong // red-500 — bold stop of error gradients
    val SuccessDeep = MeeshyPaletteGenerated.SuccessDeep // emerald-500 — bold stop of success gradients

    /**
     * The alert red as INK on a LIGHT surface (iOS #9121): [Error] only holds
     * 2.77:1 on white — under the 3:1 of an icon. Same value as `--color-danger`
     * of the web light scheme. On a dark surface the ink stays [Error].
     */
    val ErrorInk = MeeshyPaletteGenerated.ErrorInk

    // Currency (iOS #6427) — the SILVER of the Meesh coin: a slate grey with a hint of blue
    // reads as metal, where the amber of the reward entry reads as "claim me".
    val MeeshSilver = MeeshyPaletteGenerated.MeeshSilver

    // Frank hues outside the brand (iOS #8877)
    val Blue500 = MeeshyPaletteGenerated.Blue500
    val Orange500 = MeeshyPaletteGenerated.Orange500
    val Amber500 = MeeshyPaletteGenerated.Amber500

    // Composer plateau (iOS O6) — the two tints the indigo ramp does not cover. A plateau is a
    // background CHOSEN by the author, so it stays a token: contrast measures guard it.
    val PlateauNoir = MeeshyPaletteGenerated.PlateauNoir
    val Violet950 = MeeshyPaletteGenerated.Violet950

    // Tile tints (iOS #8877)
    val TileCoral = MeeshyPaletteGenerated.TileCoral
    val TileSaffron = MeeshyPaletteGenerated.TileSaffron
    val TileBlue = MeeshyPaletteGenerated.TileBlue
    val TileAmethyst = MeeshyPaletteGenerated.TileAmethyst
    val TileSky = MeeshyPaletteGenerated.TileSky
    val TileEmerald = MeeshyPaletteGenerated.TileEmerald
    val TileTeal = MeeshyPaletteGenerated.TileTeal
    val TileCyan = MeeshyPaletteGenerated.TileCyan
    val TileRose = MeeshyPaletteGenerated.TileRose

    // Named planes (iOS #8877)
    val SurfaceDarkBase = MeeshyPaletteGenerated.SurfaceDarkBase
    val SurfaceDarkDeep = MeeshyPaletteGenerated.SurfaceDarkDeep
    val SurfaceDarkRaised = MeeshyPaletteGenerated.SurfaceDarkRaised
    val SurfaceDarkInput = MeeshyPaletteGenerated.SurfaceDarkInput
    val SurfaceLightRaised = MeeshyPaletteGenerated.SurfaceLightRaised
    val SurfaceLightMist = MeeshyPaletteGenerated.SurfaceLightMist
    val SurfaceLightInput = MeeshyPaletteGenerated.SurfaceLightInput

    /** Neutral accent of a blocked profile (iOS #8877). */
    val BlockedNeutral = MeeshyPaletteGenerated.BlockedNeutral

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
