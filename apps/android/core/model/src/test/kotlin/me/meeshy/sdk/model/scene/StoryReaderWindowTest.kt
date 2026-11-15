package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryReaderWindowTest {

    private val ids = listOf("a", "b", "c", "d", "e", "f")

    @Test
    fun `la fenetre au milieu couvre une en arriere et deux en avant`() {
        assertThat(StoryReaderWindow.indices(current = 2, count = 6)).containsExactly(1, 2, 3, 4).inOrder()
    }

    @Test
    fun `au premier slide la fenetre n a pas de retour`() {
        assertThat(StoryReaderWindow.indices(current = 0, count = 6)).containsExactly(0, 1, 2).inOrder()
    }

    @Test
    fun `au dernier slide la fenetre n a pas d avance`() {
        assertThat(StoryReaderWindow.indices(current = 5, count = 6)).containsExactly(4, 5).inOrder()
    }

    @Test
    fun `un groupe d un seul slide ne garde que lui`() {
        assertThat(StoryReaderWindow.indices(current = 0, count = 1)).containsExactly(0)
    }

    @Test
    fun `un rang hors bornes ou un groupe vide donne une fenetre vide`() {
        assertThat(StoryReaderWindow.indices(current = 6, count = 6)).isEmpty()
        assertThat(StoryReaderWindow.indices(current = -1, count = 6)).isEmpty()
        assertThat(StoryReaderWindow.indices(current = 0, count = 0)).isEmpty()
    }

    @Test
    fun `a froid tout le voisinage se prepare la courante d abord`() {
        val plan = StoryReaderWindow.plan(ids, current = 2, warm = emptySet())
        assertThat(plan.prepare).containsExactly("c", "b", "d", "e").inOrder()
        assertThat(plan.evict).isEmpty()
    }

    @Test
    fun `avancer d un slide prepare le nouveau bord et evince l ancien`() {
        val plan = StoryReaderWindow.plan(ids, current = 3, warm = setOf("b", "c", "d", "e"))
        assertThat(plan.prepare).containsExactly("f")
        assertThat(plan.evict).containsExactly("b")
    }

    @Test
    fun `un slide deja chaud n est pas prepare deux fois`() {
        val plan = StoryReaderWindow.plan(ids, current = 2, warm = setOf("b", "c", "d", "e"))
        assertThat(plan.prepare).isEmpty()
        assertThat(plan.evict).isEmpty()
    }

    @Test
    fun `un rang courant invalide evince tout`() {
        val plan = StoryReaderWindow.plan(ids, current = 9, warm = setOf("a", "b"))
        assertThat(plan.prepare).isEmpty()
        assertThat(plan.evict).containsExactly("a", "b")
    }

    @Test
    fun `les slides supplementaires restent chaudes hors fenetre et ne sont pas evincees`() {
        val plan = StoryReaderWindow.plan(ids, current = 0, warm = setOf("x1"), extraWarm = listOf("x1", "x2"))
        assertThat(plan.evict).isEmpty()
        assertThat(plan.prepare).containsExactly("a", "b", "c", "x2").inOrder()
    }

    @Test
    fun `une slide supplementaire retiree de la liste est evincee`() {
        val plan = StoryReaderWindow.plan(ids, current = 0, warm = setOf("a", "b", "c", "x1"))
        assertThat(plan.evict).containsExactly("x1")
    }
}
