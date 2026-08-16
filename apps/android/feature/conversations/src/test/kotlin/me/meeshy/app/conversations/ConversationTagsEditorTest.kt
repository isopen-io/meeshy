package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Tag chip add/remove decisions (parity iOS `ConversationOptionsViewModel
 * .addTag`/`.removeTag`). Behaviour asserted through the pure
 * [ConversationTagsEditor] SSOT: a blank tag is inert, a duplicate is inert
 * (case-sensitive, mirrors iOS's own exact-match `contains` check), and
 * removal is a plain set-difference that no-ops on an absent tag.
 */
class ConversationTagsEditorTest {

    @Test
    fun `adding a tag appends it trimmed`() {
        val next = ConversationTagsEditor.add(listOf("work"), "  family  ")

        assertThat(next).containsExactly("work", "family").inOrder()
    }

    @Test
    fun `adding a blank tag is a no-op`() {
        val next = ConversationTagsEditor.add(listOf("work"), "   ")

        assertThat(next).containsExactly("work")
    }

    @Test
    fun `adding a tag already present is a no-op`() {
        val next = ConversationTagsEditor.add(listOf("work", "family"), "work")

        assertThat(next).containsExactly("work", "family").inOrder()
    }

    @Test
    fun `removing a tag drops it`() {
        val next = ConversationTagsEditor.remove(listOf("work", "family"), "work")

        assertThat(next).containsExactly("family")
    }

    @Test
    fun `removing an absent tag is a no-op`() {
        val next = ConversationTagsEditor.remove(listOf("work"), "family")

        assertThat(next).containsExactly("work")
    }
}
