package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameRect
import org.junit.Test

/** Les décors des classiques sont tirés à graine fixe, avec les formules d'iOS, bit pour bit. */
class CallMontageDecorTest {

    private val canvas = CallFrameRect(0.0, 0.0, 1080.0, 1920.0)

    @Test
    fun `le tirage reproduit celui d iOS bit pour bit`() {
        assertThat(CallMontageDecor.unit(CallMontageDecor.GOLD_SEED, 0, 3)).isEqualTo(0.12757388707715867)
        assertThat(CallMontageDecor.unit(CallMontageDecor.HEART_SEED, 7, 8)).isEqualTo(0.7595537616540999)
        assertThat(CallMontageDecor.grainUnit(0, 0x9E37)).isEqualTo(0.6316)
        assertThat(CallMontageDecor.grainUnit(1399, 0x3C6E)).isEqualTo(0.472)
    }

    @Test
    fun `les braises sont les memes a chaque rendu, dans la toile, d opacite 0 a 1`() {
        val first = CallMontageDecor.embers(28, 0.0, canvas, CallMontageDecor.GOLD_SEED)
        assertThat(CallMontageDecor.embers(28, 0.0, canvas, CallMontageDecor.GOLD_SEED)).isEqualTo(first)
        assertThat(first).hasSize(28)
        first.forEach {
            assertThat(it.center.x).isAtLeast(0.0)
            assertThat(it.center.x).isAtMost(canvas.width)
            assertThat(it.center.y).isAtLeast(0.0)
            assertThat(it.center.y).isAtMost(canvas.height)
            assertThat(it.opacity).isAtLeast(0.0)
            assertThat(it.opacity).isAtMost(1.0)
            assertThat(it.radius).isGreaterThan(0.0)
        }
        assertThat(CallMontageDecor.embers(-3, 0.0, canvas, 1)).isEmpty()
    }

    @Test
    fun `le code-barres tient dans sa carte, ses barres de gauche a droite sans se toucher`() {
        val card = CallFrameRect(100.0, 100.0, 200.0, 120.0)
        val bars = CallMontageDecor.barcodeBars(card)
        assertThat(bars).hasSize(20)
        assertThat(bars.all { card.contains(it) }).isTrue()
        bars.zipWithNext().forEach { (left, right) -> assertThat(right.minX).isGreaterThan(left.maxX) }
    }

    @Test
    fun `la pellicule est perforee sur deux colonnes, dans sa bande`() {
        val strip = CallMontageLayout.filmStrips(1, CallMontageLayout.captureSize).single()
        val holes = CallMontageDecor.filmHoles(strip)
        assertThat(holes.size).isGreaterThan(20)
        assertThat(holes.size % 2).isEqualTo(0)
        assertThat(holes.map { it.minX }.toSet()).hasSize(2)
        assertThat(holes.all { it.minX >= strip.minX && it.maxX <= strip.maxX && it.minY < strip.maxY }).isTrue()
    }

    @Test
    fun `la trame de la BD couvre la page, une rangee sur deux decalee`() {
        val dots = CallMontageDecor.comicDots(canvas)
        assertThat(dots).isNotEmpty()
        assertThat(dots.all { it.x < canvas.width && it.y < canvas.height }).isTrue()
        val rows = dots.groupBy { it.y }.values.toList()
        assertThat(rows[0].first().x).isNotEqualTo(rows[1].first().x)
    }

    @Test
    fun `la teinte d une case sans image est stable et propre a la personne`() {
        assertThat(CallMontageDecor.placeholderHue("ana")).isEqualTo(CallMontageDecor.placeholderHue("ana"))
        assertThat(CallMontageDecor.placeholderHue("ana")).isNotEqualTo(CallMontageDecor.placeholderHue("bo"))
        assertThat(CallMontageDecor.placeholderHue("ana")).isAtLeast(0.0)
        assertThat(CallMontageDecor.placeholderHue("ana")).isLessThan(1.0)
    }
}
