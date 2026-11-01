package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ClipTransformTest {

    @Test
    fun `position et rotation sont bornees`() {
        val t = ClipTransform.IDENTITY
        assertThat(t.applying(ClipTransform.Field.X(9.0)).x).isEqualTo(1.5)
        assertThat(t.applying(ClipTransform.Field.Y(-9.0)).y).isEqualTo(-0.5)
        assertThat(t.applying(ClipTransform.Field.Rotation(720.0)).rotation).isEqualTo(180.0)
        assertThat(t.applying(ClipTransform.Field.ZIndex(-500)).zIndex).isEqualTo(-100)
    }

    @Test
    fun `l echelle suit la regle du pincement - sans plafond, plancher au plus petit cote rendu de l objet`() {
        val t = ClipTransform.IDENTITY
        assertThat(t.applying(ClipTransform.Field.Scale(99.0), smallestSideDesignPx = 140.0).scale).isEqualTo(99.0)
        assertThat(t.applying(ClipTransform.Field.Scale(0.0), smallestSideDesignPx = 140.0).scale).isWithin(1e-12).of(5.0 / 140.0)
        assertThat(t.applying(ClipTransform.Field.Scale(0.001), smallestSideDesignPx = 72.0).scale).isWithin(1e-12).of(5.0 / 72.0)
        assertThat(t.applying(ClipTransform.Field.Scale(0.04), smallestSideDesignPx = 140.0).scale).isWithin(1e-12).of(0.04)
    }

    @Test
    fun `sans cote mesurable l echelle grandit encore et ne reduit plus`() {
        val t = ClipTransform(scale = 2.0)
        assertThat(t.applying(ClipTransform.Field.Scale(0.0)).scale).isEqualTo(2.0)
        assertThat(t.applying(ClipTransform.Field.Scale(30.0)).scale).isEqualTo(30.0)
    }

    @Test
    fun `une echelle hors de toute plage survit au reglage d un autre champ`() {
        val pinched = ClipTransform(scale = 300.0)
        assertThat(pinched.applying(ClipTransform.Field.X(0.2), smallestSideDesignPx = 140.0).scale).isEqualTo(300.0)
        val tiny = ClipTransform(scale = 0.01)
        assertThat(tiny.applying(ClipTransform.Field.Rotation(45.0), smallestSideDesignPx = 140.0).scale).isEqualTo(0.01)
    }

    @Test
    fun `une valeur non finie laisse la transformation intacte`() {
        val t = ClipTransform(0.2, 0.3, 2.0, 10.0, 4)
        assertThat(t.applying(ClipTransform.Field.X(Double.NaN))).isEqualTo(t)
        assertThat(t.applying(ClipTransform.Field.Scale(Double.POSITIVE_INFINITY))).isEqualTo(t)
        assertThat(t.applying(ClipTransform.Field.Rotation(Double.NEGATIVE_INFINITY))).isEqualTo(t)
    }

    @Test
    fun `une edition n ecrit qu un champ`() {
        val t = ClipTransform(0.2, 0.3, 2.0, 10.0, 4).applying(ClipTransform.Field.Y(0.9))
        assertThat(t).isEqualTo(ClipTransform(0.2, 0.9, 2.0, 10.0, 4))
    }

    @Test
    fun `l identite est au centre sans rotation`() {
        assertThat(ClipTransform.IDENTITY).isEqualTo(ClipTransform(0.5, 0.5, 1.0, 0.0, 0))
    }
}
