package me.meeshy.sdk.model.accessibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TapTargetGeometryTest {
    @Test fun `un glyphe de 24 dp recoit 12 dp de marge de chaque cote`() {
        assertThat(TapTargetGeometry.inset(24f)).isEqualTo(12f)
    }

    @Test fun `un glyphe deja assez grand ne recoit aucune marge`() {
        assertThat(TapTargetGeometry.inset(56f)).isEqualTo(0f)
    }

    @Test fun `la zone sensible ne descend jamais sous 48 dp`() {
        assertThat(TapTargetGeometry.hitSide(20f)).isEqualTo(48f)
        assertThat(TapTargetGeometry.hitSide(60f)).isEqualTo(60f)
    }

    @Test fun `deux glyphes de 24 dp a 16 dp l un de l autre se chevauchent`() {
        assertThat(TapTargetGeometry.overlaps(24f, 24f, 16f)).isTrue()
        assertThat(TapTargetGeometry.overlaps(24f, 24f, 24f)).isFalse()
    }
}
