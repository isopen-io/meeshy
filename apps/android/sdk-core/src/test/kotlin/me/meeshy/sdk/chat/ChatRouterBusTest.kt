package me.meeshy.sdk.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.navigation.ReplyContextRequest
import org.junit.Test

class ChatRouterBusTest {
    @Test
    fun `consume ne rend que les demandes de la conversation`() {
        val bus = ChatRouterBus()
        bus.requestHighlight("m1", "c1")
        bus.requestSearch("c1")
        bus.requestReply(ReplyContextRequest("c1", "s1", "story"))

        assertThat(bus.consume("c2").isEmpty).isTrue()
        assertThat(bus.state.value.hasPendingFor("c1")).isTrue()
        val mine = bus.consume("c1")
        assertThat(mine.highlightMessageId).isEqualTo("m1")
        assertThat(mine.openSearch).isTrue()
        assertThat(mine.replyContext?.targetId).isEqualTo("s1")
        assertThat(bus.consume("c1").isEmpty).isTrue()
    }

    @Test
    fun `une demande a chaud est visible dans l'etat`() {
        val bus = ChatRouterBus()
        bus.requestSearch("c1")
        assertThat(bus.state.value.hasPendingFor("c1")).isTrue()
    }
}
