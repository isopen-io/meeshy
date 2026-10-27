package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class FriseBarDragTest {

    private val geometry = TimelineGeometry(zoomScale = 1f) // 50 px/s
    private val bar = ClipWindowResolver.Window(start = 2f, duration = 3f)

    private fun drag(
        handle: FriseBarDrag.Handle,
        dxPx: Float,
        candidates: List<SnapCandidate> = emptyList(),
        snapDisabled: Boolean = false,
    ) = FriseBarDrag.resolve(
        handle = handle, from = bar, translationPx = dxPx, geometry = geometry,
        candidates = candidates, snapDisabled = snapDisabled,
    )

    @Test
    fun `glisser le corps deplace la fenetre sans changer la duree`() {
        assertThat(drag(FriseBarDrag.Handle.BODY, 50f)).isEqualTo(ClipWindowResolver.Window(3f, 3f))
    }

    @Test
    fun `la poignee de debut garde la fin fixe`() {
        val w = drag(FriseBarDrag.Handle.START, -50f)
        assertThat(w.start).isEqualTo(1f)
        assertThat(w.end).isEqualTo(5f)
    }

    @Test
    fun `la poignee de fin garde le debut fixe`() {
        val w = drag(FriseBarDrag.Handle.END, 100f)
        assertThat(w.start).isEqualTo(2f)
        assertThat(w.end).isEqualTo(7f)
    }

    @Test
    fun `le corps ne passe jamais sous zero`() {
        assertThat(drag(FriseBarDrag.Handle.BODY, -900f).start).isEqualTo(0f)
    }

    @Test
    fun `le debut s'aimante a la tete de lecture dans la tolerance`() {
        val head = SnapCandidate(SnapCandidate.Kind.PLAYHEAD, 3.05f)
        val w = drag(FriseBarDrag.Handle.START, 50f * 1.02f, listOf(head)) // brut 3.02
        assertThat(w.start).isEqualTo(3.05f)
        assertThat(w.end).isEqualTo(5f)
    }

    @Test
    fun `la fin du corps s'aimante aussi quand c'est elle qui est proche`() {
        val edge = SnapCandidate(SnapCandidate.Kind.CLIP_START, 6.0f)
        val w = drag(FriseBarDrag.Handle.BODY, 50f * 1.04f, listOf(edge)) // fin brute 6.04
        assertThat(w.end).isWithin(1e-4f).of(6.0f)
        assertThat(w.duration).isEqualTo(3f)
    }

    @Test
    fun `l'aimantation coupee laisse le temps brut`() {
        val head = SnapCandidate(SnapCandidate.Kind.PLAYHEAD, 3.05f)
        val w = drag(FriseBarDrag.Handle.START, 50f * 1.02f, listOf(head), snapDisabled = true)
        assertThat(w.start).isWithin(1e-4f).of(3.02f)
    }

    @Test
    fun `les candidats hors de la fenetre de l'objet ne comptent pas la fenetre elle meme`() {
        val own = FriseBarDrag.candidates(
            tracks = listOf(
                Plan2DTrack("a", "a", TrackPlane.FG, 0, TrackBar.Timed(2.0, 5.0)),
                Plan2DTrack("b", "b", TrackPlane.FG, 1, TrackBar.Timed(6.0, 8.0)),
            ),
            draggedTrackId = "a", playhead = 4f, slideDuration = 10f,
        )
        val times = own.map { it.time }
        assertThat(times).containsAtLeast(0f, 10f, 4f, 6f, 8f)
        assertThat(times).containsNoneOf(2f, 5f)
    }
}
