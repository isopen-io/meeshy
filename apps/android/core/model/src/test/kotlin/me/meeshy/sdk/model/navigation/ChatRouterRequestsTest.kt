package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatRouterRequestsTest {
    private fun reply(conversationId: String) = ReplyContextRequest(conversationId, targetId = "s1", kind = "story")

    @Test
    fun `consume ne rend que les demandes de la conversation qui ramasse`() {
        val state = ChatRouterRequests()
            .requestHighlight("m1", "c1")
            .requestSearch("c1")
            .requestReply(reply("c1"))

        val (stolen, untouched) = state.consume("c2")

        assertThat(stolen.isEmpty).isTrue()
        assertThat(untouched).isEqualTo(state)
        val (mine, consumed) = state.consume("c1")
        assertThat(mine.highlightMessageId).isEqualTo("m1")
        assertThat(mine.openSearch).isTrue()
        assertThat(mine.replyContext?.targetId).isEqualTo("s1")
        assertThat(consumed).isEqualTo(ChatRouterRequests())
    }

    @Test
    fun `une demande se ramasse une seule fois`() {
        val (_, after) = ChatRouterRequests().requestSearch("c1").consume("c1")
        assertThat(after.consume("c1").first.openSearch).isFalse()
    }

    @Test
    fun `ramasser une conversation ne brule pas la demande d'une autre`() {
        val state = ChatRouterRequests().requestHighlight("m2", "c2").requestSearch("c1")
        val (mine, rest) = state.consume("c1")
        assertThat(mine.openSearch).isTrue()
        assertThat(mine.highlightMessageId).isNull()
        assertThat(rest.consume("c2").first.highlightMessageId).isEqualTo("m2")
    }

    @Test
    fun `une demande non scopee est ramassee par la premiere conversation`() {
        val state = ChatRouterRequests().requestHighlight("m1", null).requestSearch(null)
        val (delivery, rest) = state.consume("cX")
        assertThat(delivery.highlightMessageId).isEqualTo("m1")
        assertThat(delivery.openSearch).isTrue()
        assertThat(rest.hasPendingFor("cY")).isFalse()
    }

    @Test
    fun `un identifiant de message vide ne pose aucune demande`() {
        assertThat(ChatRouterRequests().requestHighlight(" ", "c1").hasPendingFor("c1")).isFalse()
    }
}
