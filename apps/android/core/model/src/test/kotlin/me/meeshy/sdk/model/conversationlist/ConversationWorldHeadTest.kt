package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationWorldHeadTest {

    private data class Row(val id: String, val worldWide: Boolean = false, val archived: Boolean = false)

    private fun split(vararg rows: Row) =
        ConversationWorldHead.split(rows.toList(), { it.worldWide }, { it.archived })

    @Test
    fun `World Wide non archivee monte en tete et quitte le reste`() {
        val result = split(Row("a"), Row("ww", worldWide = true), Row("b"))
        assertThat(result.head?.id).isEqualTo("ww")
        assertThat(result.rest.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `World Wide archivee reste dans le reste comme les autres`() {
        val result = split(Row("a"), Row("ww", worldWide = true, archived = true))
        assertThat(result.head).isNull()
        assertThat(result.rest.map { it.id }).containsExactly("a", "ww").inOrder()
    }

    @Test
    fun `sans World Wide aucune tete`() {
        val result = split(Row("a"))
        assertThat(result.head).isNull()
        assertThat(result.rest).hasSize(1)
    }

    @Test
    fun `la tete n'a ni en-tete ni repliage ni depot`() {
        assertThat(ConversationWorldHead.isHead("world.head")).isTrue()
        assertThat(ConversationListSectionDefaults.isCollapsible("world.head")).isFalse()
        assertThat(ConversationListSectionDefaults.acceptsDrop("world.head")).isFalse()
        assertThat(ConversationListSectionDefaults.showsHeader("world.head", false)).isFalse()
    }
}
