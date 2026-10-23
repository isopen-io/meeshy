package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerFocusBorderPolicyTest {
    @Test fun `au focus la bordure va de l'accent a l'indigo 600 a 0,55 et 0,45`() {
        val b = ComposerFocusBorderPolicy.resolve(focused = true)
        assertThat(b.startSource).isEqualTo(BorderColorSource.Accent)
        assertThat(b.startAlpha).isEqualTo(0.55f)
        assertThat(b.endSource).isEqualTo(BorderColorSource.Indigo600)
        assertThat(b.endAlpha).isEqualTo(0.45f)
    }

    @Test fun `au repos la bordure est invisible`() {
        val b = ComposerFocusBorderPolicy.resolve(focused = false)
        assertThat(b.startAlpha).isEqualTo(0f)
        assertThat(b.endAlpha).isEqualTo(0f)
        assertThat(b.isVisible).isFalse()
    }

    @Test fun `la bordure focus est visible`() {
        assertThat(ComposerFocusBorderPolicy.resolve(true).isVisible).isTrue()
    }
}
