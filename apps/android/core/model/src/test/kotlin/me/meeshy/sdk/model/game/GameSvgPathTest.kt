package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameSvgSegment.CubicTo
import me.meeshy.sdk.model.game.GameSvgSegment.LineTo
import me.meeshy.sdk.model.game.GameSvgSegment.MoveTo
import org.junit.Test

class GameSvgPathTest {

    private fun parse(d: String) = GameSvgSegments.parse(d)

    @Test
    fun `M L Z absolus`() {
        assertThat(parse("M10 20 L30 40 Z")).containsExactly(
            MoveTo(10.0, 20.0), LineTo(30.0, 40.0), GameSvgSegment.Close,
        ).inOrder()
    }

    @Test
    fun `les paires apres un M sont des L implicites`() {
        assertThat(parse("M0 0 5 5 10 0")).containsExactly(
            MoveTo(0.0, 0.0), LineTo(5.0, 5.0), LineTo(10.0, 0.0),
        ).inOrder()
    }

    @Test
    fun `les relatifs partent du point courant`() {
        assertThat(parse("M38 74 l-8 30 9-6 5 9 6-30z")).containsExactly(
            MoveTo(38.0, 74.0), LineTo(30.0, 104.0), LineTo(39.0, 98.0),
            LineTo(44.0, 107.0), LineTo(50.0, 77.0), GameSvgSegment.Close,
        ).inOrder()
    }

    @Test
    fun `h et v absolus et relatifs`() {
        assertThat(parse("M14 10 h72 v38 H0 V0")).containsExactly(
            MoveTo(14.0, 10.0), LineTo(86.0, 10.0), LineTo(86.0, 48.0),
            LineTo(0.0, 48.0), LineTo(0.0, 0.0),
        ).inOrder()
    }

    @Test
    fun `cubique relative et absolue`() {
        assertThat(parse("M0 0 c0 24 -16 37 -36 45 C1 2 3 4 5 6")).containsExactly(
            MoveTo(0.0, 0.0),
            CubicTo(0.0, 24.0, -16.0, 37.0, -36.0, 45.0),
            CubicTo(1.0, 2.0, 3.0, 4.0, 5.0, 6.0),
        ).inOrder()
    }

    @Test
    fun `S reflechit le second point de controle`() {
        val segments = parse("M0 0 C0 10 10 10 10 0 S20 -10 20 0")
        assertThat(segments[2]).isEqualTo(CubicTo(10.0, -10.0, 20.0, -10.0, 20.0, 0.0))
    }

    @Test
    fun `l'ecu de rang se ferme au point de depart`() {
        val segments = parse("M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z")
        val last = segments[segments.size - 2] as CubicTo
        assertThat(last.x).isEqualTo(14.0)
        assertThat(last.y).isEqualTo(48.0)
        assertThat(segments.last()).isEqualTo(GameSvgSegment.Close)
    }

    @Test
    fun `un demi-cercle en arc fait deux cubiques et finit sur la cible`() {
        val segments = parse("M0 0 a10 10 0 0 1 20 0")
        assertThat(segments).hasSize(3)
        val end = segments.last() as CubicTo
        assertThat(end.x).isEqualTo(20.0)
        assertThat(end.y).isEqualTo(0.0)
        val mid = segments[1] as CubicTo
        assertThat(mid.x).isWithin(1e-9).of(10.0)
        assertThat(mid.y).isWithin(1e-9).of(-10.0)
    }

    @Test
    fun `le sens de l'arc suit le drapeau sweep`() {
        val sweep0 = (parse("M0 0 a10 10 0 0 0 20 0")[1] as CubicTo).y
        assertThat(sweep0).isWithin(1e-9).of(10.0)
    }

    @Test
    fun `un arc de rayon nul devient une ligne`() {
        assertThat(parse("M0 0 a0 5 0 0 1 4 4")).containsExactly(MoveTo(0.0, 0.0), LineTo(4.0, 4.0)).inOrder()
    }

    @Test
    fun `une chaine mal formee s'arrete la ou elle casse`() {
        assertThat(parse("M1 2 L3")).containsExactly(MoveTo(1.0, 2.0))
        assertThat(parse("X1 2")).isEmpty()
        assertThat(parse("")).isEmpty()
    }

    @Test
    fun `les nombres collés par le signe et les exposants se lisent`() {
        assertThat(parse("M1e1-5L.5.5")).containsExactly(MoveTo(10.0, -5.0), LineTo(0.5, 0.5)).inOrder()
    }
}
