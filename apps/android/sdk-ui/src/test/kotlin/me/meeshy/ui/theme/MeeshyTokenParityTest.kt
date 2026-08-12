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
            assertThat(textMuted).isEqualTo(Color(0x80818CF8)) // indigo400 @50%
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
            assertThat(textSecondary).isEqualTo(Color(0x994338CA)) // indigo700 @60%
            assertThat(textMuted).isEqualTo(Color(0x666366F1)) // indigo500 @40%
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
