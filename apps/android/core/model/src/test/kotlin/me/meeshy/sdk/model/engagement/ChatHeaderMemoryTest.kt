package me.meeshy.sdk.model.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatHeaderMemoryTest {

    @Test
    fun `expanding adds the conversation and collapsing removes it`() {
        val expanded = HeaderMemoryIds.with(emptySet(), "c1", true)
        assertThat(expanded).containsExactly("c1")
        assertThat(HeaderMemoryIds.with(expanded, "c1", false)).isEmpty()
    }

    @Test
    fun `other conversations are left alone`() {
        assertThat(HeaderMemoryIds.with(setOf("a", "b"), "c", true)).containsExactly("a", "b", "c")
        assertThat(HeaderMemoryIds.with(setOf("a", "b"), "a", false)).containsExactly("b")
    }

    @Test
    fun `an empty conversation id is never written`() {
        assertThat(HeaderMemoryIds.with(setOf("a"), "", true)).containsExactly("a")
    }
}
