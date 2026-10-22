package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Non-regression contract: every design token must stay byte-identical to the
 * iOS source of truth (parity plan §3, ported from `MeeshyColors.swift` +
 * `DesignTokens.swift`). The expected literals below ARE the iOS values — if a
 * palette or dimen drifts, this test fails. Never "fix" the test by copying the
 * drifted value; fix the token.
 */
class MeeshyTokenParityTest {

    // MARK: - §3.1 Indigo scale + accents + neutrals

    @Test
    fun `indigo scale matches iOS hex`() {
        assertThat(MeeshyPalette.Indigo50).isEqualTo(Color(0xFFEEF2FF))
        assertThat(MeeshyPalette.Indigo100).isEqualTo(Color(0xFFE0E7FF))
        assertThat(MeeshyPalette.Indigo200).isEqualTo(Color(0xFFC7D2FE))
        assertThat(MeeshyPalette.Indigo300).isEqualTo(Color(0xFFA5B4FC))
        assertThat(MeeshyPalette.Indigo400).isEqualTo(Color(0xFF818CF8))
        assertThat(MeeshyPalette.Indigo500).isEqualTo(Color(0xFF6366F1))
        assertThat(MeeshyPalette.Indigo600).isEqualTo(Color(0xFF4F46E5))
        assertThat(MeeshyPalette.Indigo700).isEqualTo(Color(0xFF4338CA))
        assertThat(MeeshyPalette.Indigo800).isEqualTo(Color(0xFF3730A3))
        assertThat(MeeshyPalette.Indigo900).isEqualTo(Color(0xFF312E81))
        assertThat(MeeshyPalette.Indigo950).isEqualTo(Color(0xFF1E1B4B))
    }

    @Test
    fun `purple accents match iOS hex`() {
        assertThat(MeeshyPalette.Purple500).isEqualTo(Color(0xFFA855F7))
        assertThat(MeeshyPalette.Purple600).isEqualTo(Color(0xFF8B5CF6))
        assertThat(MeeshyPalette.Purple700).isEqualTo(Color(0xFFB24BF3))
    }

    @Test
    fun `neutral scale matches iOS hex`() {
        assertThat(MeeshyPalette.Neutral400).isEqualTo(Color(0xFF9CA3AF))
        assertThat(MeeshyPalette.Neutral500).isEqualTo(Color(0xFF6B7280))
        assertThat(MeeshyPalette.Neutral600).isEqualTo(Color(0xFF4B5563))
    }

    // MARK: - §3.2 Semantics (static, never accented)

    @Test
    fun `semantic colors match iOS hex`() {
        assertThat(MeeshyPalette.Success).isEqualTo(Color(0xFF34D399))
        assertThat(MeeshyPalette.Warning).isEqualTo(Color(0xFFFBBF24))
        assertThat(MeeshyPalette.Error).isEqualTo(Color(0xFFF87171))
        assertThat(MeeshyPalette.Info).isEqualTo(Color(0xFF60A5FA))
        assertThat(MeeshyPalette.ReadReceipt).isEqualTo(Color(0xFF818CF8)) // indigo400
        assertThat(MeeshyPalette.PinnedBlue).isEqualTo(Color(0xFF3B82F6))
    }

    @Test
    fun `semantic tonal variants match iOS hex`() {
        assertThat(MeeshyPalette.ErrorDark).isEqualTo(Color(0xFF991B1B))
        assertThat(MeeshyPalette.ErrorSoft).isEqualTo(Color(0xFFFCA5A5))
        assertThat(MeeshyPalette.ErrorStrong).isEqualTo(Color(0xFFEF4444))
        assertThat(MeeshyPalette.SuccessDeep).isEqualTo(Color(0xFF10B981))
    }

    @Test
    fun `unread badge background is themed like iOS`() {
        assertThat(MeeshyPalette.unreadBadgeBackground(isDark = true)).isEqualTo(Color(0xFF991B1B))
        assertThat(MeeshyPalette.unreadBadgeBackground(isDark = false)).isEqualTo(Color(0xFFF87171))
    }

    // MARK: - §3.3 Theme tokens (dark + light)

    @Test
    fun `dark tokens match iOS ThemeManager`() {
        with(DarkMeeshyTokens) {
            assertThat(backgroundPrimary).isEqualTo(Color(0xFF09090B))
            assertThat(backgroundSecondary).isEqualTo(Color(0xFF13111C))
            assertThat(backgroundTertiary).isEqualTo(Color(0xFF1E1B4B))
            assertThat(textPrimary).isEqualTo(Color(0xFFEEF2FF))
            assertThat(textSecondary).isEqualTo(Color(0xFFA5B4FC))
            assertThat(textMuted).isEqualTo(Color(0xB3A5B4FC)) // indigo300 @70% — D-18, AA
            assertThat(inputBackground).isEqualTo(Color(0xFF16142A))
            assertThat(inputBorder).isEqualTo(Color(0x99312E81)) // indigo900 @60%
        }
    }

    @Test
    fun `light tokens match iOS ThemeManager`() {
        with(LightMeeshyTokens) {
            assertThat(backgroundPrimary).isEqualTo(Color(0xFFFFFFFF))
            assertThat(backgroundSecondary).isEqualTo(Color(0xFFF8F7FF))
            assertThat(backgroundTertiary).isEqualTo(Color(0xFFEEF2FF))
            assertThat(textPrimary).isEqualTo(Color(0xFF1E1B4B))
            assertThat(textSecondary).isEqualTo(Color(0xCC4338CA)) // indigo700 @80% — D-18 bis, AA
            assertThat(textMuted).isEqualTo(Color(0xCC4338CA)) // indigo700 @80% — D-18, AA
            assertThat(inputBackground).isEqualTo(Color(0xFFF5F3FF))
            assertThat(inputBorder).isEqualTo(Color(0xFFC7D2FE))
        }
    }

    // MARK: - §3.4 Signature gradients (color stops)

    @Test
    fun `signature gradient stops match iOS`() {
        assertThat(MeeshyPalette.BrandGradient)
            .containsExactly(Color(0xFF6366F1), Color(0xFF4338CA)).inOrder()
        assertThat(MeeshyPalette.BrandGradientLight)
            .containsExactly(Color(0xFF818CF8), Color(0xFF6366F1)).inOrder()
        assertThat(MeeshyPalette.AvatarRingGradient)
            .containsExactly(Color(0xFF6366F1), Color(0xFF818CF8), Color(0xFF6366F1)).inOrder()
        assertThat(MeeshyPalette.AccentGradient)
            .containsExactly(Color(0xFF4F46E5), Color(0xFF6366F1), Color(0xFF818CF8)).inOrder()
    }

    @Test
    fun `subtle gradient stops carry 30 percent alpha`() {
        assertThat(MeeshyPalette.BrandGradientSubtle).hasSize(2)
        MeeshyPalette.BrandGradientSubtle.forEach {
            assertThat(it.alpha).isWithin(0.01f).of(0.3f)
        }
    }

    // MARK: - Lot couleurs-de-marque — jetons complétés (MeeshyColors.swift)

    @Test
    fun `error ink is the light-surface red of iOS`() {
        assertThat(MeeshyPalette.ErrorInk).isEqualTo(Color(0xFFC81E1E))
    }

    @Test
    fun `meesh silver is the currency metal of iOS`() {
        assertThat(MeeshyPalette.MeeshSilver).isEqualTo(Color(0xFFA8B1BF))
    }

    @Test
    fun `frank hues outside the brand match iOS`() {
        assertThat(MeeshyPalette.Blue500).isEqualTo(Color(0xFF3B82F6))
        assertThat(MeeshyPalette.Orange500).isEqualTo(Color(0xFFF97316))
        assertThat(MeeshyPalette.Amber500).isEqualTo(Color(0xFFF59E0B))
    }

    @Test
    fun `composer plateau tints match iOS`() {
        assertThat(MeeshyPalette.PlateauNoir).isEqualTo(Color(0xFF000000))
        assertThat(MeeshyPalette.Violet950).isEqualTo(Color(0xFF2E1065))
    }

    @Test
    fun `tile tints match iOS`() {
        assertThat(MeeshyPalette.TileCoral).isEqualTo(Color(0xFFFF6B6B))
        assertThat(MeeshyPalette.TileSaffron).isEqualTo(Color(0xFFF8B500))
        assertThat(MeeshyPalette.TileBlue).isEqualTo(Color(0xFF3498DB))
        assertThat(MeeshyPalette.TileAmethyst).isEqualTo(Color(0xFF9B59B6))
        assertThat(MeeshyPalette.TileSky).isEqualTo(Color(0xFF45B7D1))
        assertThat(MeeshyPalette.TileEmerald).isEqualTo(Color(0xFF2ECC71))
        assertThat(MeeshyPalette.TileTeal).isEqualTo(Color(0xFF4ECDC4))
        assertThat(MeeshyPalette.TileCyan).isEqualTo(Color(0xFF08D9D6))
        assertThat(MeeshyPalette.TileRose).isEqualTo(Color(0xFFFF2E63))
    }

    @Test
    fun `named planes match iOS`() {
        assertThat(MeeshyPalette.SurfaceDarkBase).isEqualTo(Color(0xFF09090B))
        assertThat(MeeshyPalette.SurfaceDarkDeep).isEqualTo(Color(0xFF0F0D19))
        assertThat(MeeshyPalette.SurfaceDarkRaised).isEqualTo(Color(0xFF13111C))
        assertThat(MeeshyPalette.SurfaceDarkInput).isEqualTo(Color(0xFF16142A))
        assertThat(MeeshyPalette.SurfaceLightRaised).isEqualTo(Color(0xFFF8F7FF))
        assertThat(MeeshyPalette.SurfaceLightMist).isEqualTo(Color(0xFFFAFAFF))
        assertThat(MeeshyPalette.SurfaceLightInput).isEqualTo(Color(0xFFF5F3FF))
    }

    @Test
    fun `blocked profile accent is the neutral grey of iOS`() {
        assertThat(MeeshyPalette.BlockedNeutral).isEqualTo(Color(0xFF888888))
    }

    @Test
    fun `link feature accents resolve to the indigo scale or a semantic color`() {
        assertThat(MeeshyPalette.TrackingAccent).isEqualTo(MeeshyPalette.Indigo600)
        assertThat(MeeshyPalette.ShareAccent).isEqualTo(MeeshyPalette.Indigo400)
        assertThat(MeeshyPalette.CommunityAccent).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `hex strings stay in lockstep with their colors`() {
        val pairs = listOf(
            MeeshyPalette.Hex.BrandPrimary to MeeshyPalette.Indigo500,
            MeeshyPalette.Hex.BrandDeep to MeeshyPalette.Indigo700,
            MeeshyPalette.Hex.Success to MeeshyPalette.Success,
            MeeshyPalette.Hex.Error to MeeshyPalette.Error,
            MeeshyPalette.Hex.ErrorInk to MeeshyPalette.ErrorInk,
            MeeshyPalette.Hex.Warning to MeeshyPalette.Warning,
            MeeshyPalette.Hex.Info to MeeshyPalette.Info,
            MeeshyPalette.Hex.Neutral500 to MeeshyPalette.Neutral500,
            MeeshyPalette.Hex.Indigo50 to MeeshyPalette.Indigo50,
            MeeshyPalette.Hex.Indigo300 to MeeshyPalette.Indigo300,
            MeeshyPalette.Hex.Indigo400 to MeeshyPalette.Indigo400,
            MeeshyPalette.Hex.Indigo600 to MeeshyPalette.Indigo600,
            MeeshyPalette.Hex.Indigo900 to MeeshyPalette.Indigo900,
            MeeshyPalette.Hex.Purple500 to MeeshyPalette.Purple500,
            MeeshyPalette.Hex.TrackingAccent to MeeshyPalette.TrackingAccent,
            MeeshyPalette.Hex.ShareAccent to MeeshyPalette.ShareAccent,
            MeeshyPalette.Hex.CommunityAccent to MeeshyPalette.CommunityAccent,
            MeeshyPalette.Hex.MeeshSilver to MeeshyPalette.MeeshSilver,
            MeeshyPalette.Hex.Blue500 to MeeshyPalette.Blue500,
            MeeshyPalette.Hex.Orange500 to MeeshyPalette.Orange500,
            MeeshyPalette.Hex.Amber500 to MeeshyPalette.Amber500,
            MeeshyPalette.Hex.BlockedNeutral to MeeshyPalette.BlockedNeutral,
            MeeshyPalette.Hex.TileCoral to MeeshyPalette.TileCoral,
            MeeshyPalette.Hex.TileSaffron to MeeshyPalette.TileSaffron,
            MeeshyPalette.Hex.TileBlue to MeeshyPalette.TileBlue,
            MeeshyPalette.Hex.TileAmethyst to MeeshyPalette.TileAmethyst,
            MeeshyPalette.Hex.TileSky to MeeshyPalette.TileSky,
            MeeshyPalette.Hex.TileEmerald to MeeshyPalette.TileEmerald,
            MeeshyPalette.Hex.TileTeal to MeeshyPalette.TileTeal,
            MeeshyPalette.Hex.TileCyan to MeeshyPalette.TileCyan,
            MeeshyPalette.Hex.TileRose to MeeshyPalette.TileRose,
            MeeshyMessageStateColors.Hex.ViewOnce to MeeshyMessageStateColors.ViewOnce,
            MeeshyMessageStateColors.Hex.Opened to MeeshyMessageStateColors.Opened,
            MeeshyMessageStateColors.Hex.Ephemeral to MeeshyMessageStateColors.Ephemeral,
            MeeshyMessageStateColors.Hex.Concealed to MeeshyMessageStateColors.Concealed,
            MeeshyMessageStateColors.Hex.Failed to MeeshyMessageStateColors.Failed,
        )
        pairs.forEach { (hex, color) -> assertThat(hexColor(hex)).isEqualTo(color) }
    }

    // MARK: - États d'un message (#7599)

    @Test
    fun `message state colors match iOS`() {
        assertThat(MeeshyMessageStateColors.ViewOnce).isEqualTo(Color(0xFF6366F1))
        assertThat(MeeshyMessageStateColors.Opened).isEqualTo(Color(0xFF9CA3AF))
        assertThat(MeeshyMessageStateColors.Ephemeral).isEqualTo(Color(0xFFF97316))
        assertThat(MeeshyMessageStateColors.Concealed).isEqualTo(Color(0xFF6B7280))
        assertThat(MeeshyMessageStateColors.Failed).isEqualTo(Color(0xFFEF4444))
    }

    @Test
    fun `each message state tint says one state only`() {
        val tints = listOf(
            MeeshyMessageStateColors.ViewOnce,
            MeeshyMessageStateColors.Opened,
            MeeshyMessageStateColors.Ephemeral,
            MeeshyMessageStateColors.Concealed,
            MeeshyMessageStateColors.Failed,
        )
        assertThat(tints.toSet()).hasSize(tints.size)
    }

    // MARK: - Chrome posé sur un média (#8878, #8879)

    @Test
    fun `media chrome scale matches iOS`() {
        with(MeeshyMediaChromeColors) {
            assertThat(OnMedia).isEqualTo(Color(0xFFFFFFFF))
            assertThat(OnMediaSecondary).isEqualTo(Color(0xD9FFFFFF)) // white @85%
            assertThat(OnMediaMuted).isEqualTo(Color(0xB3FFFFFF)) // white @70%
            assertThat(MediaFill).isEqualTo(Color(0x26FFFFFF)) // white @15%
            assertThat(MediaHairline).isEqualTo(Color(0x33FFFFFF)) // white @20%
            assertThat(MediaBackdrop).isEqualTo(Color(0xFF000000))
            assertThat(ScrimSoft).isEqualTo(Color(0x4D000000)) // black @30%
            assertThat(Scrim).isEqualTo(Color(0x80000000)) // black @50%
            assertThat(ScrimStrong).isEqualTo(Color(0xB3000000)) // black @70%
            assertThat(OnBrand).isEqualTo(Color(0xFFFFFFFF))
        }
    }

    @Test
    fun `media chrome iOS view names alias the scale`() {
        with(MeeshyMediaChromeColors) {
            assertThat(ChromeForeground).isEqualTo(OnMedia)
            assertThat(ChromeSecondary).isEqualTo(OnMediaSecondary)
            assertThat(ChromeTertiary).isEqualTo(OnMediaMuted)
            assertThat(ChromeFill).isEqualTo(Color(0x59000000)) // backdrop @35%
            assertThat(ChromeScrim).isEqualTo(Scrim)
        }
    }

    @Test
    fun `media scrim gradients run between 55 percent black and transparent`() {
        with(MeeshyMediaChromeColors) {
            assertThat(ScrimTopStops).containsExactly(Color(0x8C000000), Color(0x00000000)).inOrder()
            assertThat(ScrimBottomStops).containsExactly(Color(0x00000000), Color(0x8C000000)).inOrder()
        }
    }

    // MARK: - Jetons adaptatifs (isDark)

    @Test
    fun `adaptive text and plane tokens match iOS`() {
        with(MeeshyAdaptiveColors) {
            assertThat(textPrimary(isDark = true)).isEqualTo(Color(0xFFEEF2FF))
            assertThat(textPrimary(isDark = false)).isEqualTo(Color(0xFF1E1B4B))
            assertThat(textSecondary(isDark = true)).isEqualTo(Color(0xFFA5B4FC))
            assertThat(textSecondary(isDark = false)).isEqualTo(Color(0xCC4338CA))
            assertThat(textMuted(isDark = true)).isEqualTo(Color(0xB3A5B4FC))
            assertThat(textMuted(isDark = false)).isEqualTo(Color(0xCC4338CA))
            assertThat(backgroundPrimary(isDark = true)).isEqualTo(Color(0xFF09090B))
            assertThat(backgroundPrimary(isDark = false)).isEqualTo(Color(0xFFFFFFFF))
            assertThat(backgroundSecondary(isDark = true)).isEqualTo(Color(0xFF13111C))
            assertThat(backgroundSecondary(isDark = false)).isEqualTo(Color(0xFFF8F7FF))
            assertThat(backgroundTertiary(isDark = true)).isEqualTo(Color(0xFF1E1B4B))
            assertThat(backgroundTertiary(isDark = false)).isEqualTo(Color(0xFFEEF2FF))
        }
    }

    @Test
    fun `mention and hashtag tints are themed like iOS`() {
        with(MeeshyAdaptiveColors) {
            assertThat(mentionColor(isDark = true)).isEqualTo(MeeshyPalette.Indigo300)
            assertThat(mentionColor(isDark = false)).isEqualTo(MeeshyPalette.Indigo600)
            assertThat(hashtagColor(isDark = true)).isEqualTo(MeeshyPalette.Indigo400)
            assertThat(hashtagColor(isDark = false)).isEqualTo(MeeshyPalette.Indigo800)
        }
    }

    @Test
    fun `a mention stays more pronounced than a hashtag in both schemes`() {
        with(MeeshyAdaptiveColors) {
            assertThat(mentionColor(isDark = true)).isNotEqualTo(hashtagColor(isDark = true))
            assertThat(mentionColor(isDark = false)).isNotEqualTo(hashtagColor(isDark = false))
        }
    }

    @Test
    fun `adaptive veils match iOS`() {
        with(MeeshyAdaptiveColors) {
            assertThat(surfaceFill(isDark = true)).isEqualTo(Color(0x0FFFFFFF)) // white @6%
            assertThat(surfaceFill(isDark = false)).isEqualTo(Color(0x0A000000)) // black @4%
            assertThat(controlFill(isDark = true)).isEqualTo(Color(0x1AFFFFFF)) // white @10%
            assertThat(controlFill(isDark = false)).isEqualTo(Color(0x0D000000)) // black @5%
            assertThat(hairline(isDark = true)).isEqualTo(Color(0x14FFFFFF)) // white @8%
            assertThat(hairline(isDark = false)).isEqualTo(Color(0x0D000000)) // black @5%
        }
    }

    @Test
    fun `error ink is the red of a light plane and the soft red of a dark one`() {
        assertThat(MeeshyAdaptiveColors.errorInk(isDark = false)).isEqualTo(MeeshyPalette.ErrorInk)
        assertThat(MeeshyAdaptiveColors.errorInk(isDark = true)).isEqualTo(MeeshyPalette.Error)
    }

    @Test
    fun `theme tokens are the projection of the adaptive functions`() {
        listOf(false to LightMeeshyTokens, true to DarkMeeshyTokens).forEach { (isDark, tokens) ->
            with(MeeshyAdaptiveColors) {
                assertThat(tokens.backgroundPrimary).isEqualTo(backgroundPrimary(isDark))
                assertThat(tokens.backgroundSecondary).isEqualTo(backgroundSecondary(isDark))
                assertThat(tokens.backgroundTertiary).isEqualTo(backgroundTertiary(isDark))
                assertThat(tokens.textPrimary).isEqualTo(textPrimary(isDark))
                assertThat(tokens.textSecondary).isEqualTo(textSecondary(isDark))
                assertThat(tokens.textMuted).isEqualTo(textMuted(isDark))
                assertThat(tokens.inputBackground).isEqualTo(inputBackground(isDark))
                assertThat(tokens.inputBorder).isEqualTo(inputBorder(isDark))
                assertThat(tokens.errorInk).isEqualTo(errorInk(isDark))
                assertThat(tokens.mention).isEqualTo(mentionColor(isDark))
                assertThat(tokens.hashtag).isEqualTo(hashtagColor(isDark))
                assertThat(tokens.surfaceFill).isEqualTo(surfaceFill(isDark))
                assertThat(tokens.controlFill).isEqualTo(controlFill(isDark))
                assertThat(tokens.hairline).isEqualTo(hairline(isDark))
            }
        }
    }

    // MARK: - §3.6 Spacing / Radius (strict iOS values)

    @Test
    fun `spacing scale matches iOS DesignTokens`() {
        assertThat(MeeshySpacing.xs.value).isEqualTo(4f)
        assertThat(MeeshySpacing.sm.value).isEqualTo(8f)
        assertThat(MeeshySpacing.md.value).isEqualTo(12f)
        assertThat(MeeshySpacing.lg.value).isEqualTo(16f)
        assertThat(MeeshySpacing.xl.value).isEqualTo(20f)
        assertThat(MeeshySpacing.xxl.value).isEqualTo(24f)
        assertThat(MeeshySpacing.xxxl.value).isEqualTo(32f)
    }

    @Test
    fun `radius scale matches iOS DesignTokens`() {
        assertThat(MeeshyRadius.sm.value).isEqualTo(10f)
        assertThat(MeeshyRadius.md.value).isEqualTo(14f)
        assertThat(MeeshyRadius.lg.value).isEqualTo(16f)
        assertThat(MeeshyRadius.xl.value).isEqualTo(20f)
        assertThat(MeeshyRadius.xxl.value).isEqualTo(24f)
    }
}
