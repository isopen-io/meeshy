package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GradientAngleTest {

    private val tolerance = 1e-9

    @Test
    fun `zero degrees runs from bottom to top like CSS`() {
        val axis = GradientAngle.axis(0.0)
        assertThat(axis.startX).isWithin(tolerance).of(0.5)
        assertThat(axis.startY).isWithin(tolerance).of(1.0)
        assertThat(axis.endY).isWithin(tolerance).of(0.0)
    }

    @Test
    fun `ninety degrees runs from left to right`() {
        val axis = GradientAngle.axis(90.0)
        assertThat(axis.startX).isWithin(tolerance).of(0.0)
        assertThat(axis.endX).isWithin(tolerance).of(1.0)
        assertThat(axis.startY).isWithin(tolerance).of(0.5)
    }

    @Test
    fun `one hundred eighty degrees runs from top to bottom`() {
        val axis = GradientAngle.axis(180.0)
        assertThat(axis.startY).isWithin(tolerance).of(0.0)
        assertThat(axis.endY).isWithin(tolerance).of(1.0)
    }

    @Test
    fun `the axis is symmetric around the centre at any angle`() {
        val axis = GradientAngle.axis(135.0)
        assertThat(axis.startX + axis.endX).isWithin(tolerance).of(1.0)
        assertThat(axis.startY + axis.endY).isWithin(tolerance).of(1.0)
    }
}
