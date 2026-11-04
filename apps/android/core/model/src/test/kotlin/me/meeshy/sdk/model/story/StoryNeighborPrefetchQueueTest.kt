package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryNeighborPrefetchQueueTest {
    @Test
    fun `une slide planifiee deux fois n'est preparee qu'une fois`() {
        val queue = StoryNeighborPrefetchQueue<String>()
        queue.plan(listOf("a", "b"))
        queue.plan(listOf("a", "b"))
        assertThat(listOfNotNull(queue.next(), queue.next(), queue.next())).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une slide demarree ou terminee n'est pas replanifiee`() {
        val queue = StoryNeighborPrefetchQueue<String>()
        queue.plan(listOf("a", "b"))
        val a = queue.next()!!
        queue.plan(listOf("a", "b"))
        assertThat(queue.pendingKeys).containsExactly("b")
        queue.complete(a)
        queue.plan(listOf("a", "b"))
        assertThat(queue.pendingKeys).containsExactly("b")
    }

    @Test
    fun `un changement de slide annule ce qui n'a pas demarre sans toucher a ce qui est parti`() {
        val queue = StoryNeighborPrefetchQueue<String>()
        queue.plan(listOf("a", "b", "c"))
        queue.next()
        val cancelled = queue.plan(listOf("c", "d"))
        assertThat(cancelled).containsExactly("b")
        assertThat(queue.inFlight).containsExactly("a")
        assertThat(queue.pendingKeys).containsExactly("c", "d").inOrder()
    }

    @Test
    fun `le nouvel ordre fait passer la voisine du sens du geste en premier`() {
        val queue = StoryNeighborPrefetchQueue<String>()
        queue.plan(listOf("n+1", "n-1"))
        queue.plan(listOf("n-1", "n+1"))
        assertThat(queue.next()).isEqualTo("n-1")
    }

    @Test
    fun `une panne libere la cle pour un nouvel essai`() {
        val queue = StoryNeighborPrefetchQueue<String>()
        queue.plan(listOf("a"))
        queue.fail(queue.next()!!)
        queue.plan(listOf("a"))
        assertThat(queue.next()).isEqualTo("a")
    }

    @Test
    fun `clear oublie tout a la fermeture`() {
        val queue = StoryNeighborPrefetchQueue<String>()
        queue.plan(listOf("a", "b"))
        queue.next()
        queue.clear()
        assertThat(queue.inFlight).isEmpty()
        assertThat(queue.pendingKeys).isEmpty()
    }
}
