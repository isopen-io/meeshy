package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.conversationlist.SectionableLiveCall
import org.junit.Test

class ConversationSectionMappingTest {

    private fun conversation(
        pinned: Boolean = false,
        categoryId: String? = null,
        order: Int? = null,
        lastMessageAt: String? = null,
        updatedAt: String? = "2026-10-01T10:00:00Z",
    ) = ApiConversation(
        id = "c1",
        updatedAt = updatedAt,
        lastMessage = lastMessageAt?.let { ApiConversationLastMessage(createdAt = it) },
        preferences = ApiConversationPreferences(isPinned = pinned, categoryId = categoryId, orderInCategory = order),
    )

    @Test
    fun `une epinglee sans categorie est epinglee`() {
        assertThat(conversation(pinned = true).toSectionable().isPinned).isTrue()
    }

    @Test
    fun `une epinglee rangee garde sa categorie et ne flotte pas`() {
        val mapped = conversation(pinned = true, categoryId = "work").toSectionable()

        assertThat(mapped.isPinned).isFalse()
        assertThat(mapped.categoryId).isEqualTo("work")
    }

    @Test
    fun `l'ordre dans la categorie passe tel quel`() {
        assertThat(conversation(categoryId = "work", order = 3).toSectionable().orderInCategory).isEqualTo(3.0)
    }

    @Test
    fun `la date est celle du dernier message sinon updatedAt`() {
        val withMessage = conversation(lastMessageAt = "2026-10-02T10:00:00Z").toSectionable()
        val without = conversation().toSectionable()

        assertThat(withMessage.effectiveTimestampMillis).isGreaterThan(without.effectiveTimestampMillis)
        assertThat(without.lastMessageAtMillis).isNull()
    }

    @Test
    fun `un appel en cours range la conversation en direct`() {
        assertThat(conversation().toSectionable(callInProgress = true).liveCall).isEqualTo(SectionableLiveCall)
        assertThat(conversation().toSectionable().liveCall).isNull()
    }
}
