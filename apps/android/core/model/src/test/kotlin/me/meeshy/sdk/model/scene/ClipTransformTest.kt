package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ClipTransformTest {

    @Test
    fun `position scale et rotation sont bornes`() {
        val t = ClipTransform.IDENTITY
        assertThat(t.applying(ClipTransform.Field.X(9.0)).x).isEqualTo(1.5)
        assertThat(t.applying(ClipTransform.Field.Y(-9.0)).y).isEqualTo(-0.5)
        assertThat(t.applying(ClipTransform.Field.Scale(0.0)).scale).isEqualTo(0.05)
        assertThat(t.applying(ClipTransform.Field.Scale(99.0)).scale).isEqualTo(8.0)
        assertThat(t.applying(ClipTransform.Field.Rotation(720.0)).rotation).isEqualTo(180.0)
        assertThat(t.applying(ClipTransform.Field.ZIndex(-500)).zIndex).isEqualTo(-100)
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
