package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.world.WorldEntry
import org.junit.Test

class ChatHeaderPublicShareTest {

    private val world = WorldEntry(identifier = "mshy_world", title = "World Wide", shareLinkIdentifier = "mshy_world")
    private val global = ApiConversation(id = "c1", type = "global", identifier = "mshy_world")
    private val group = ApiConversation(id = "c2", type = "group")

    private fun state(conversation: ApiConversation?, guestLinkId: String? = null, served: WorldEntry? = null) =
        ChatHeaderController.headerStateOf(conversation, 0, "me", guestLinkId, served, "https://meeshy.me")

    @Test
    fun `la conversation World Wide partage le lien servi`() {
        assertThat(state(global, served = world).publicShareUrl).isEqualTo("https://meeshy.me/chat/mshy_world")
    }

    @Test
    fun `tant que l'entree n'est pas lue il n'y a pas de bouton`() {
        assertThat(state(global).publicShareUrl).isNull()
    }

    @Test
    fun `un invite partage le lien par lequel il est entre`() {
        assertThat(state(group, guestLinkId = "mshy_k").publicShareUrl).isEqualTo("https://meeshy.me/chat/mshy_k")
    }

    @Test
    fun `une conversation ordinaire ne porte aucun lien`() {
        assertThat(state(group, served = world).publicShareUrl).isNull()
    }
}
