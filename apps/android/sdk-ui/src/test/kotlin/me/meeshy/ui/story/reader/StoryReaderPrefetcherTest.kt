package me.meeshy.ui.story.reader

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryReaderPrefetcherTest {

    private class FakeSlide(val id: String) : PreparedStorySlide {
        val activations = mutableListOf<Boolean>()
        var released = false
        override fun setActive(active: Boolean) { activations += active }
        override fun release() { released = true }
    }

    private class Rig {
        val made = mutableMapOf<String, FakeSlide>()
        val prefetcher = StoryReaderPrefetcher { id -> FakeSlide(id).also { made[id] = it } }
    }

    private val ids = listOf("a", "b", "c", "d", "e", "f")

    @Test
    fun `la fenetre prepare une en arriere et deux en avant`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 2)
        assertThat(rig.prefetcher.preparedIds).containsExactly("b", "c", "d", "e")
        assertThat(rig.prefetcher.slide("f")).isNull()
    }

    @Test
    fun `avancer evince et libere le slide sorti de la fenetre`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 2)
        rig.prefetcher.updateWindow(ids, current = 3)
        assertThat(rig.made.getValue("b").released).isTrue()
        assertThat(rig.made.getValue("c").released).isFalse()
        assertThat(rig.prefetcher.preparedIds).containsExactly("c", "d", "e", "f")
    }

    @Test
    fun `un slide deja chaud n est pas prepare une seconde fois`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 2)
        val first = rig.prefetcher.slide("d")
        rig.prefetcher.updateWindow(ids, current = 3)
        assertThat(rig.prefetcher.slide("d")).isSameInstanceAs(first)
    }

    @Test
    fun `seule la courante est activee et les voisines restent en pause`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 2)
        rig.prefetcher.activate("c")
        assertThat(rig.made.getValue("c").activations).containsExactly(true)
        assertThat(rig.made.getValue("d").activations).isEmpty()
    }

    @Test
    fun `activer est idempotent et passer au slide suivant met l ancien en pause`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 2)
        rig.prefetcher.activate("c")
        rig.prefetcher.activate("c")
        assertThat(rig.made.getValue("c").activations).containsExactly(true)
        rig.prefetcher.activate("d")
        assertThat(rig.made.getValue("c").activations).containsExactly(true, false).inOrder()
        assertThat(rig.made.getValue("d").activations).containsExactly(true)
    }

    @Test
    fun `une slide evincee puis reprise repart en pause`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 2)
        rig.prefetcher.activate("c")
        rig.prefetcher.updateWindow(ids, current = 5)
        rig.prefetcher.updateWindow(ids, current = 2)
        rig.prefetcher.activate("c")
        assertThat(rig.made.getValue("c").activations).containsExactly(true)
    }

    @Test
    fun `les slides supplementaires survivent a la fenetre`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 0, extraWarm = listOf("next-author"))
        rig.prefetcher.updateWindow(ids, current = 1, extraWarm = listOf("next-author"))
        assertThat(rig.prefetcher.slide("next-author")).isNotNull()
        assertThat(rig.made.getValue("next-author").released).isFalse()
    }

    @Test
    fun `detach libere tout`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 0)
        rig.prefetcher.detach()
        assertThat(rig.prefetcher.preparedIds).isEmpty()
        assertThat(rig.made.values.all { it.released }).isTrue()
    }

    @Test
    fun `un rang invalide evince tout`() {
        val rig = Rig()
        rig.prefetcher.updateWindow(ids, current = 1)
        rig.prefetcher.updateWindow(emptyList(), current = 0)
        assertThat(rig.prefetcher.preparedIds).isEmpty()
    }
}
