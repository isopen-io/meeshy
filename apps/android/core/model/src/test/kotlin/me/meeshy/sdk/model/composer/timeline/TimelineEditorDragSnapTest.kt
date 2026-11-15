package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TimelineEditorDragSnapTest {

    private fun twoClips() = editorOf(projectOf(media = listOf(video("a", 0.0, 2.0), video("b", 5.0, 2.0)), slideDuration = 10f))

    private fun startOf(editor: TimelineEditor, id: String) = editor.project.mediaObjects.first { it.id == id }.startTime

    @Test
    fun `le bord d'un clip s'accroche au bord de l'autre dans la tolerance du doigt`() {
        val dragged = twoClips().beginDrag("b").dragMoved(rawTime = 2.1f, geometry = geometry)

        assertThat(startOf(dragged, "b")).isWithin(1e-4).of(2.0)
        assertThat(dragged.selection.activeDrag!!.snappedTo).isEqualTo(ClipSelectionState.SnappedKind.CLIP_END)
    }

    @Test
    fun `l'haptique ne sonne qu'a la transition non accroche vers accroche`() {
        val first = twoClips().beginDrag("b").dragMoved(3f, geometry)
        val snapped = first.dragMoved(2.1f, geometry)
        val stillSnapped = snapped.dragMoved(2.05f, geometry)
        val released = stillSnapped.dragMoved(3f, geometry).dragMoved(2.1f, geometry)

        assertThat(first.snapPulse).isEqualTo(0)
        assertThat(snapped.snapPulse).isEqualTo(1)
        assertThat(stillSnapped.snapPulse).isEqualTo(1)
        assertThat(released.snapPulse).isEqualTo(2)
    }

    @Test
    fun `l'aimant coupe laisse le clip suivre le doigt`() {
        val dragged = twoClips().toggleSnap().beginDrag("b").dragMoved(2.1f, geometry)

        assertThat(startOf(dragged, "b")).isWithin(1e-4).of(2.1)
        assertThat(dragged.selection.activeDrag!!.snappedTo).isNull()
    }

    @Test
    fun `la tete de lecture est un point d'accroche`() {
        val dragged = twoClips().scrub(3.5f).beginDrag("b").dragMoved(3.45f, geometry)

        assertThat(startOf(dragged, "b")).isWithin(1e-4).of(3.5)
        assertThat(dragged.selection.activeDrag!!.snappedTo).isEqualTo(ClipSelectionState.SnappedKind.PLAYHEAD)
    }

    @Test
    fun `un glissé produit une seule commande annulable`() {
        val released = twoClips().beginDrag("b").dragMoved(3f, geometry).dragMoved(2.1f, geometry).endDrag()

        assertThat(released.stack.size).isEqualTo(1)
        assertThat(released.selection.isDragging).isFalse()
        assertThat(startOf(released.undo(), "b")).isWithin(1e-4).of(5.0)
    }

    @Test
    fun `revenir au point de depart n'empile rien`() {
        val released = twoClips().beginDrag("b").dragMoved(6f, geometry).dragMoved(5f, geometry).endDrag()

        assertThat(released.stack.size).isEqualTo(0)
    }

    @Test
    fun `annuler le glissé rend le debut d'origine`() {
        val cancelled = twoClips().beginDrag("b").dragMoved(8f, geometry).cancelDrag()

        assertThat(startOf(cancelled, "b")).isWithin(1e-4).of(5.0)
        assertThat(cancelled.stack.size).isEqualTo(0)
    }

    @Test
    fun `le clip synthetique du fond ne se glisse pas`() {
        val project = TimelineSlideBinding.load(
            me.meeshy.sdk.model.StorySlide(id = "s1"), hasBackgroundImage = true,
        )
        val dragged = editorOf(project).beginDrag(project.mediaObjects.single().id)

        assertThat(dragged.selection.isDragging).isFalse()
    }

    @Test
    fun `la duree de la slide suit le glissé et le toast ne sonne qu'au relache contre la duree d'avant`() {
        val editor = editorOf(projectOf(media = listOf(video("a", 0.0, 4.0)), slideDuration = 6f))
        val mid = editor.beginDrag("a").dragMoved(9f, geometry)

        assertThat(mid.project.slideDuration).isWithin(1e-4f).of(13f)
        assertThat(mid.durationNotice).isNull()

        val released = mid.endDrag()
        assertThat(released.durationNotice).isEqualTo(DurationNotice(from = 6f, to = 13f))
    }
}
