package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.BridgeAnnouncement
import me.meeshy.sdk.model.ConversationBridge
import org.junit.Test

class ConversationLivePatchBridgeTest {
    private val held = ConversationBridge(kind = ConversationBridge.KIND_FALLBACK, unreadCount = 3)
    private fun row() = ApiConversation(id = "c1", type = "group", unreadCount = 3, bridge = held)

    @Test
    fun `un compteur sans pont calcule garde le pont de la ligne`() {
        val next = ConversationLivePatch.applyUnread(row(), 4)
        assertThat(next?.unreadCount).isEqualTo(4)
        assertThat(next?.bridge).isEqualTo(held)
    }

    @Test
    fun `un pont efface retire le pont meme a compteur egal`() {
        val next = ConversationLivePatch.applyUnread(row(), 3, BridgeAnnouncement.Cleared)
        assertThat(next?.bridge).isNull()
    }

    @Test
    fun `un pont neuf remplace l'ancien`() {
        val fresh = ConversationBridge(kind = ConversationBridge.KIND_AGENT, unreadCount = 3, text = "Resume")
        assertThat(ConversationLivePatch.applyUnread(row(), 3, BridgeAnnouncement.Announced(fresh))?.bridge).isEqualTo(fresh)
    }

    @Test
    fun `rien ne change rien n'est ecrit`() {
        assertThat(ConversationLivePatch.applyUnread(row(), 3)).isNull()
        assertThat(ConversationLivePatch.applyUnread(row(), 3, BridgeAnnouncement.Announced(held))).isNull()
    }
}
