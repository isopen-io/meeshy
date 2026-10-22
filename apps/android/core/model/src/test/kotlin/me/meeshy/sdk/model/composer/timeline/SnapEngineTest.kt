package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.timeline.SnapCandidate.Kind
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SnapEngineTest {

    private val engine = SnapEngine(toleranceSeconds = 0.2f)

    @Test
    fun `aucun candidat dans la tolerance rend le temps brut`() {
        val result = engine.snap(1f, listOf(SnapCandidate(Kind.PLAYHEAD, 2f)))
        assertThat(result).isEqualTo(SnapResult(1f, null))
    }

    @Test
    fun `le candidat le plus proche gagne`() {
        val near = SnapCandidate(Kind.GRID_MINOR, 1.05f)
        val far = SnapCandidate(Kind.PLAYHEAD, 1.15f)
        assertThat(engine.snap(1f, listOf(far, near)).matched).isEqualTo(near)
    }

    @Test
    fun `a distance egale la priorite departage dans l ordre de la spec`() {
        val order = listOf(
            Kind.PLAYHEAD, Kind.CLIP_START, Kind.KEYFRAME, Kind.GRID_MAJOR, Kind.GRID_MINOR, Kind.SLIDE_START,
        )
        order.indices.forEach { i ->
            val candidates = order.drop(i).reversed().map { SnapCandidate(it, 3f) }
            assertThat(engine.snap(3f, candidates).matched?.kind).isEqualTo(order[i])
        }
    }

    @Test
    fun `les priorites sont celles de la spec`() {
        assertThat(
            listOf(
                Kind.PLAYHEAD, Kind.CLIP_START, Kind.CLIP_END, Kind.KEYFRAME, Kind.GRID_MAJOR,
                Kind.GRID_MINOR, Kind.SLIDE_START, Kind.SLIDE_END,
            ).map(SnapEngine::priority),
        ).containsExactly(70, 60, 60, 50, 40, 30, 20, 20).inOrder()
    }

    @Test
    fun `un candidat hors tolerance est ignore meme prioritaire`() {
        val result = engine.snap(1f, listOf(SnapCandidate(Kind.PLAYHEAD, 1.5f), SnapCandidate(Kind.SLIDE_END, 1.1f)))
        assertThat(result.matched?.kind).isEqualTo(Kind.SLIDE_END)
        assertThat(result.snappedTime).isEqualTo(1.1f)
    }

    @Test
    fun `desactivee ou non finie l aimantation rend le temps brut`() {
        val c = listOf(SnapCandidate(Kind.PLAYHEAD, 1f))
        assertThat(engine.snap(1f, c, disabled = true)).isEqualTo(SnapResult(1f, null))
        assertThat(engine.snap(Float.NaN, c).matched).isNull()
        assertThat(engine.snap(1f, listOf(SnapCandidate(Kind.PLAYHEAD, Float.NaN))).matched).isNull()
    }

    @Test
    fun `une tolerance negative est ramenee a zero`() {
        assertThat(SnapEngine(-3f).toleranceSeconds).isEqualTo(0f)
    }

    @Test
    fun `la tolerance de glissement est plafonnee a un quart de seconde a tout zoom`() {
        listOf(0.05f, 0.5f, 1f, 4f, 10f).forEach { zoom ->
            assertThat(TimelineGeometry(zoom).dragSnapToleranceSeconds).isAtMost(0.25f)
        }
        assertThat(TimelineGeometry(0.05f).dragSnapToleranceSeconds).isEqualTo(0.25f)
        assertThat(TimelineGeometry(1f).dragSnapToleranceSeconds).isWithin(1e-6f).of(0.16f)
    }
}
