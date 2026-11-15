package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ClipSelectionStateTest {

    @Test
    fun `un tap surligne sans ouvrir la fiche`() {
        val state = ClipSelectionState().select("a")
        assertThat(state.selectedClipId).isEqualTo("a")
        assertThat(state.inspectedClipId).isNull()
    }

    @Test
    fun `le double tap inspecte et surligne le meme clip`() {
        val state = ClipSelectionState().inspect("a")
        assertThat(state.selectedClipId).isEqualTo("a")
        assertThat(state.inspectedClipId).isEqualTo("a")
    }

    @Test
    fun `surligner un autre clip referme la fiche ouverte`() {
        val state = ClipSelectionState().inspect("a").select("b")
        assertThat(state.selectedClipId).isEqualTo("b")
        assertThat(state.inspectedClipId).isNull()
    }

    @Test
    fun `fermer la fiche garde le clip surligne`() {
        val state = ClipSelectionState().inspect("a").endInspection()
        assertThat(state.selectedClipId).isEqualTo("a")
        assertThat(state.inspectedClipId).isNull()
    }

    @Test
    fun `deselectionner efface surlignage et fiche`() {
        val state = ClipSelectionState().inspect("a").deselect()
        assertThat(state.selectedClipId).isNull()
        assertThat(state.inspectedClipId).isNull()
    }

    @Test
    fun `un glisse garde son origine et suit la position et l accroche`() {
        val dragging = ClipSelectionState().beginDrag("a", 2f).updateDrag(3.5f, ClipSelectionState.SnappedKind.CLIP_END)
        assertThat(dragging.isDragging).isTrue()
        assertThat(dragging.activeDrag).isEqualTo(
            ClipSelectionState.ActiveDrag("a", 2f, 3.5f, ClipSelectionState.SnappedKind.CLIP_END),
        )
        assertThat(dragging.endDrag().isDragging).isFalse()
    }

    @Test
    fun `mettre a jour sans glisse ne cree rien`() {
        assertThat(ClipSelectionState().updateDrag(1f, null).activeDrag).isNull()
    }
}
