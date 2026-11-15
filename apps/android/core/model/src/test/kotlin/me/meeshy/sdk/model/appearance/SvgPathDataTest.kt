package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.SvgSegment.Close
import me.meeshy.sdk.model.appearance.SvgSegment.CubicTo
import me.meeshy.sdk.model.appearance.SvgSegment.LineTo
import me.meeshy.sdk.model.appearance.SvgSegment.MoveTo
import me.meeshy.sdk.model.appearance.SvgSegment.QuadTo
import org.junit.Test

class SvgPathDataTest {

    private fun parse(d: String) = SvgPathData.parse(d)

    @Test
    fun `absolute move line and close`() {
        assertThat(parse("M10 20 L30 40 Z")).containsExactly(MoveTo(10.0, 20.0), LineTo(30.0, 40.0), Close).inOrder()
    }

    @Test
    fun `relative commands accumulate from the current point`() {
        assertThat(parse("m10 10 l5 5 h5 v-5"))
            .containsExactly(MoveTo(10.0, 10.0), LineTo(15.0, 15.0), LineTo(20.0, 15.0), LineTo(20.0, 10.0)).inOrder()
    }

    @Test
    fun `pairs after a move are implicit lines`() {
        assertThat(parse("M0 0 10 10 20 0")).containsExactly(MoveTo(0.0, 0.0), LineTo(10.0, 10.0), LineTo(20.0, 0.0)).inOrder()
    }

    @Test
    fun `H and V absolute use the current other axis`() {
        assertThat(parse("M5 5 H20 V30")).containsExactly(MoveTo(5.0, 5.0), LineTo(20.0, 5.0), LineTo(20.0, 30.0)).inOrder()
    }

    @Test
    fun `cubic and smooth cubic reflect the previous control point`() {
        val segments = parse("M0 0 C0 10 10 10 10 0 S20 -10 20 0")
        assertThat(segments[1]).isEqualTo(CubicTo(0.0, 10.0, 10.0, 10.0, 10.0, 0.0))
        assertThat(segments[2]).isEqualTo(CubicTo(10.0, -10.0, 20.0, -10.0, 20.0, 0.0))
    }

    @Test
    fun `smooth cubic without a previous cubic starts at the current point`() {
        assertThat(parse("M0 0 S5 5 10 0")[1]).isEqualTo(CubicTo(0.0, 0.0, 5.0, 5.0, 10.0, 0.0))
    }

    @Test
    fun `quadratic relative`() {
        assertThat(parse("M10 10 q5 5 10 0")[1]).isEqualTo(QuadTo(15.0, 15.0, 20.0, 10.0))
    }

    @Test
    fun `a close returns the current point to the subpath start`() {
        assertThat(parse("M10 10 L20 10 Z l5 0")).containsExactly(
            MoveTo(10.0, 10.0), LineTo(20.0, 10.0), Close, LineTo(15.0, 10.0),
        ).inOrder()
    }

    @Test
    fun `a half circle arc becomes two cubics ending exactly on the target`() {
        val segments = parse("M0 0 A5 5 0 0 1 10 0")
        val cubics = segments.drop(1).filterIsInstance<CubicTo>()
        assertThat(cubics).hasSize(2)
        assertThat(cubics.last().x).isEqualTo(10.0)
        assertThat(cubics.last().y).isEqualTo(0.0)
    }

    @Test
    fun `a quarter arc is a single cubic and sweep flips the bulge`() {
        val up = parse("M0 0 A10 10 0 0 1 10 -10")[1] as CubicTo
        val down = parse("M0 0 A10 10 0 0 0 10 -10")[1] as CubicTo
        assertThat(up.y1).isNotEqualTo(down.y1)
    }

    @Test
    fun `a zero radius arc is a straight line`() {
        assertThat(parse("M0 0 A0 5 0 0 1 10 0")[1]).isEqualTo(LineTo(10.0, 0.0))
    }

    @Test
    fun `a malformed string stops cleanly keeping what precedes`() {
        assertThat(parse("M0 0 L10 10 L20")).containsExactly(MoveTo(0.0, 0.0), LineTo(10.0, 10.0)).inOrder()
        assertThat(parse("M0 0 X5 5")).containsExactly(MoveTo(0.0, 0.0))
        assertThat(parse("")).isEmpty()
        assertThat(parse("L 5 5 Q")).containsExactly(LineTo(5.0, 5.0))
    }

    @Test
    fun `numbers accept exponents signs and compact forms`() {
        assertThat(parse("M1e1-5L.5.5")).containsExactly(MoveTo(10.0, -5.0), LineTo(0.5, 0.5)).inOrder()
    }

    @Test
    fun `arc flags may be glued to the next number`() {
        val segments = parse("M0 0a5 5 0 1110 0")
        assertThat((segments.last() as CubicTo).x).isEqualTo(10.0)
    }

    @Test
    fun `a number without a command is ignored`() {
        assertThat(parse("10 20")).isEmpty()
    }
}
