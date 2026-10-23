package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerLineBoundsTest {
    @Test fun `le champ va de une a cinq lignes`() {
        assertThat(ComposerLineBounds.MIN_LINES).isEqualTo(1)
        assertThat(ComposerLineBounds.MAX_LINES).isEqualTo(5)
    }

    @Test fun `la hauteur mini est la cible tactile de 44`() {
        assertThat(ComposerLineBounds.MIN_HEIGHT_DP).isEqualTo(44f)
    }

    @Test fun `un nombre de lignes est borne a 1 5`() {
        assertThat(ComposerLineBounds.clamp(0)).isEqualTo(1)
        assertThat(ComposerLineBounds.clamp(3)).isEqualTo(3)
        assertThat(ComposerLineBounds.clamp(12)).isEqualTo(5)
    }

    @Test fun `la hauteur ne descend jamais sous 44 et plafonne a cinq lignes`() {
        assertThat(ComposerLineBounds.heightDp(lines = 1, lineHeightDp = 20f, verticalPaddingDp = 12f)).isEqualTo(44f)
        assertThat(ComposerLineBounds.heightDp(lines = 3, lineHeightDp = 20f, verticalPaddingDp = 12f)).isEqualTo(72f)
        assertThat(ComposerLineBounds.heightDp(lines = 9, lineHeightDp = 20f, verticalPaddingDp = 12f)).isEqualTo(112f)
    }
}
