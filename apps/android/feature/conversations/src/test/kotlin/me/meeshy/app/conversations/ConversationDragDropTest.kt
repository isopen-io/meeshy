package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationDragDropTest {

    private val before = setOf("pinned", "other", "work")

    private fun dragging(origin: String? = "work") = ConversationDragState().also { it.start("c1", origin) }

    @Test
    fun `hors glissement rien n est replié`() {
        val state = ConversationDragState()
        state.onListEntered(before)
        assertThat(state.collapsedExpanded).isNull()
        assertThat(state.isDragging).isFalse()
    }

    @Test
    fun `le doigt qui survole la liste replie toutes les sections et marque l origine`() {
        val state = dragging(origin = "work")
        state.onListEntered(before)
        assertThat(state.collapsedExpanded).isEmpty()
        assertThat(state.originSectionId).isEqualTo("work")
        assertThat(state.draggedId).isEqualTo("c1")
    }

    @Test
    fun `la fin restaure l ensemble précédent plus la cible dépliée`() {
        val state = dragging()
        state.onListEntered(before)
        state.noteDropped("family")
        val restored = state.finish()
        assertThat(restored).containsExactly("pinned", "other", "work", "family")
        assertThat(state.collapsedExpanded).isNull()
        assertThat(state.isDragging).isFalse()
        assertThat(state.originSectionId).isNull()
    }

    @Test
    fun `une annulation restaure l ensemble sans cible`() {
        val state = dragging()
        state.onListEntered(before)
        assertThat(state.finish()).isEqualTo(before)
    }

    @Test
    fun `une fin sans repli ne restaure rien`() {
        val state = dragging()
        assertThat(state.finish()).isNull()
        assertThat(state.isDragging).isFalse()
    }

    @Test
    fun `l en-tête survolé se lève à la sortie`() {
        val state = dragging()
        state.hover("pinned")
        assertThat(state.hoveredSectionId).isEqualTo("pinned")
        state.finish()
        assertThat(state.hoveredSectionId).isNull()
    }
}
