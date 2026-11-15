package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DragSectionCollapseTest {

    private val before = setOf("pinned", "other", "work")

    @Test
    fun `le premier survol replie tout et sauvegarde l ensemble courant`() {
        val step = DragSectionCollapse.begin(DragSectionCollapse.Idle, expanded = before, origin = "work")
        assertThat(step.expanded).isEmpty()
        assertThat(step.state.saved).isEqualTo(before)
        assertThat(step.state.origin).isEqualTo("work")
        assertThat(step.state.isActive).isTrue()
    }

    @Test
    fun `un second survol pendant le glissement ne resauvegarde pas l ensemble replié`() {
        val first = DragSectionCollapse.begin(DragSectionCollapse.Idle, before, "work")
        val second = DragSectionCollapse.begin(first.state, first.expanded, "other")
        assertThat(second.state.saved).isEqualTo(before)
        assertThat(second.state.origin).isEqualTo("work")
        assertThat(second.expanded).isEmpty()
    }

    @Test
    fun `la fin restaure l ensemble précédent et déplie la cible`() {
        val started = DragSectionCollapse.begin(DragSectionCollapse.Idle, before, "pinned")
        val ended = DragSectionCollapse.end(started.state, started.expanded, target = "family")
        assertThat(ended.expanded).containsExactly("pinned", "other", "work", "family")
        assertThat(ended.state).isEqualTo(DragSectionCollapse.Idle)
    }

    @Test
    fun `la fin conserve ce qui a été déplié pendant le glissement`() {
        val started = DragSectionCollapse.begin(DragSectionCollapse.Idle, before, "pinned")
        val ended = DragSectionCollapse.end(started.state, expanded = setOf("play"), target = null)
        assertThat(ended.expanded).containsExactly("pinned", "other", "work", "play")
    }

    @Test
    fun `une cible vide, Mes conversations vers aucune catégorie, n ajoute rien`() {
        val started = DragSectionCollapse.begin(DragSectionCollapse.Idle, before, "work")
        val ended = DragSectionCollapse.end(started.state, started.expanded, target = "")
        assertThat(ended.expanded).isEqualTo(before)
    }

    @Test
    fun `une fin sans début laisse l ensemble intact et sans origine`() {
        val ended = DragSectionCollapse.end(DragSectionCollapse.Idle, expanded = before, target = "work")
        assertThat(ended.expanded).isEqualTo(before)
        assertThat(ended.state).isEqualTo(DragSectionCollapse.Idle)
    }
}
