package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPlayerPoolTest {
    @Test
    fun `au plus deux lecteurs sont prepares, les plus prioritaires`() {
        val pool = StoryPlayerPool<String>()
        val diff = pool.update(listOf("n+1", "n-1", "n+2"))
        assertThat(diff.prepare).containsExactly("n+1", "n-1").inOrder()
        assertThat(pool.heldKeys).hasSize(2)
    }

    @Test
    fun `un lecteur deja tenu et encore voulu est conserve`() {
        val pool = StoryPlayerPool<String>()
        pool.update(listOf("a", "b"))
        val diff = pool.update(listOf("b", "c"))
        assertThat(diff.prepare).containsExactly("c")
        assertThat(diff.release).containsExactly("a")
    }

    @Test
    fun `releaseAll rend tout`() {
        val pool = StoryPlayerPool<String>()
        pool.update(listOf("a", "b"))
        assertThat(pool.releaseAll()).containsExactly("a", "b")
        assertThat(pool.heldKeys).isEmpty()
    }
}
