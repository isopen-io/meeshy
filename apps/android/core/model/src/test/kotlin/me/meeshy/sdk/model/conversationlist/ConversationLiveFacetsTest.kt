package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.conversationlist.ConversationLiveFacet.ACTIVITY
import me.meeshy.sdk.model.conversationlist.ConversationLiveFacet.PREVIEW
import me.meeshy.sdk.model.conversationlist.ConversationLiveFacet.UNREAD
import org.junit.Test

/**
 * #18926 — what a live event moved on a list row, facet by facet, and what a REST sweep built before it keeps of it.
 */
class ConversationLiveFacetsTest {

    private val before = ApiConversation(
        id = "c1",
        title = "Groupe",
        lastMessage = ApiConversationLastMessage(id = "m1", content = "Bonjour", createdAt = "2026-11-17T10:00:00.000Z"),
        unreadCount = 1,
        listRankAt = "2026-11-17T10:00:00.000Z",
    )

    private val arrived = before.copy(
        lastMessage = ApiConversationLastMessage(id = "m2", content = "Nouveau", createdAt = "2026-11-17T10:05:00.000Z"),
        listRankAt = "2026-11-17T10:05:00.000Z",
        unreadCount = 2,
    )

    @Test
    fun `a message arrived moves the preview, the activity and the unread`() {
        assertThat(ConversationLiveFacets.changed(before, arrived)).containsExactly(PREVIEW, ACTIVITY, UNREAD)
    }

    @Test
    fun `an unread update alone moves only the unread`() {
        assertThat(ConversationLiveFacets.changed(before, before.copy(unreadCount = 0))).containsExactly(UNREAD)
    }

    @Test
    fun `a rename moves no live facet`() {
        assertThat(ConversationLiveFacets.changed(before, before.copy(title = "Autre"))).isEmpty()
    }

    @Test
    fun `the sweep keeps the preview and the rank a live message brought during its flight, and takes the rest`() {
        val served = before.copy(title = "Renommé")

        val landed = ConversationLiveFacets.keepLive(served, local = arrived, facets = setOf(PREVIEW, ACTIVITY))

        assertThat(landed.title).isEqualTo("Renommé")
        assertThat(landed.lastMessage?.id).isEqualTo("m2")
        assertThat(landed.listRankAt).isEqualTo("2026-11-17T10:05:00.000Z")
        assertThat(landed.unreadCount).isEqualTo(1)
    }

    @Test
    fun `a facet no live event moved takes the served value, a regressed preview included`() {
        val regressed = before.copy(
            lastMessage = ApiConversationLastMessage(id = "m0", content = "Hier", createdAt = "2026-11-16T10:00:00.000Z"),
        )

        val landed = ConversationLiveFacets.keepLive(regressed, local = arrived, facets = setOf(UNREAD))

        assertThat(landed.lastMessage?.id).isEqualTo("m0")
        assertThat(landed.unreadCount).isEqualTo(2)
    }
}
