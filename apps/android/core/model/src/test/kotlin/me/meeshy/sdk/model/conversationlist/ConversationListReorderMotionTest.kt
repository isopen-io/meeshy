package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationListReorderMotionTest {

    @Test
    fun `reduce motion removes the spring`() {
        assertThat(ConversationListReorderMotion.animates(reduceMotion = true, isScrolling = false)).isFalse()
    }

    @Test
    fun `scrolling removes the spring`() {
        assertThat(ConversationListReorderMotion.animates(reduceMotion = false, isScrolling = true)).isFalse()
    }

    @Test
    fun `at rest the list spring is the 0_35 over 0_86 one`() {
        assertThat(ConversationListReorderMotion.animates(reduceMotion = false, isScrolling = false)).isTrue()
        assertThat(ConversationListReorderMotion.RESPONSE_SECONDS).isEqualTo(0.35f)
        assertThat(ConversationListReorderMotion.DAMPING_FRACTION).isEqualTo(0.86f)
    }

    @Test
    fun `one conversation rising while the others keep their order is a bump`() {
        assertThat(ConversationListReorderMotion.isBumpToTop(listOf("a", "b", "c", "d"), listOf("c", "a", "b", "d"))).isTrue()
    }

    @Test
    fun `a filter switch is not a bump`() {
        assertThat(ConversationListReorderMotion.isBumpToTop(listOf("a", "b", "c", "d"), listOf("c", "d"))).isFalse()
    }

    @Test
    fun `a page appended is not a bump`() {
        assertThat(ConversationListReorderMotion.isBumpToTop(listOf("a", "b"), listOf("a", "b", "c", "d"))).isFalse()
    }

    @Test
    fun `a rewritten order or another account is not a bump`() {
        assertThat(ConversationListReorderMotion.isBumpToTop(listOf("a", "b", "c"), listOf("c", "b", "a"))).isFalse()
        assertThat(ConversationListReorderMotion.isBumpToTop(listOf("a", "b", "c"), listOf("x", "y", "z"))).isFalse()
    }

    @Test
    fun `an unchanged or empty list is not a bump`() {
        assertThat(ConversationListReorderMotion.isBumpToTop(listOf("a", "b"), listOf("a", "b"))).isFalse()
        assertThat(ConversationListReorderMotion.isBumpToTop(emptyList(), emptyList())).isFalse()
    }

    @Test
    fun `a recent tick means scrolling and a settled or absent one does not`() {
        assertThat(ConversationListReorderMotion.isScrolling(lastTickMillis = 900, nowMillis = 1_000)).isTrue()
        assertThat(ConversationListReorderMotion.isScrolling(lastTickMillis = 0, nowMillis = 1_000)).isFalse()
        assertThat(ConversationListReorderMotion.isScrolling(lastTickMillis = null, nowMillis = 1_000)).isFalse()
    }

    @Test
    fun `the first composition never springs and a bump springs only at rest`() {
        val before = listOf("a", "b", "c")
        val after = listOf("c", "a", "b")
        assertThat(ConversationListReorderMotion.shouldSpring(null, after, false, false)).isFalse()
        assertThat(ConversationListReorderMotion.shouldSpring(before, after, false, false)).isTrue()
        assertThat(ConversationListReorderMotion.shouldSpring(before, after, true, false)).isFalse()
        assertThat(ConversationListReorderMotion.shouldSpring(before, after, false, true)).isFalse()
    }
}
