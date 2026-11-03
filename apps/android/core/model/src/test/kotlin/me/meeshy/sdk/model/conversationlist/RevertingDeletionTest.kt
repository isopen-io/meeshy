package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import org.junit.Test

class RevertingDeletionTest {

    private fun row(id: String?, text: String, author: String? = "Alice", translations: Map<String, String>? = null) =
        ApiConversation(
            id = "c1", type = "group",
            lastMessage = id?.let {
                ApiConversationLastMessage(id = it, content = text, senderName = author, createdAt = "2026-10-01T10:00:00.000Z")
            },
            lastMessageTranslations = translations,
        )

    @Test fun `le dernier message supprime revient au precedent servi, en bloc`() {
        val current = row("m2", "second", author = "Bob", translations = mapOf("en" to "second"))
        val server = row("m1", "premier", author = "Alice")

        val reverted = current.revertingDeletion("m2", server)!!

        assertThat(reverted.lastMessage?.id).isEqualTo("m1")
        assertThat(reverted.lastMessage?.content).isEqualTo("premier")
        assertThat(reverted.lastMessage?.senderName).isEqualTo("Alice")
        assertThat(reverted.lastMessageTranslations).isNull()
    }

    @Test fun `remplacant inconnu videe la ligne`() {
        val reverted = row("m2", "second", translations = mapOf("en" to "x")).revertingDeletion("m2", null)!!
        assertThat(reverted.lastMessage).isNull()
        assertThat(reverted.lastMessageTranslations).isNull()
    }

    @Test fun `un serveur qui sert encore le message supprime vide la ligne`() {
        assertThat(row("m2", "second").revertingDeletion("m2", row("m2", "second"))!!.lastMessage).isNull()
    }

    @Test fun `un serveur sans aucun message vide la ligne`() {
        assertThat(row("m2", "second").revertingDeletion("m2", row(null, ""))!!.lastMessage).isNull()
    }

    @Test fun `un conversation updated plus recent n'est pas ecrase`() {
        assertThat(row("m3", "troisieme").revertingDeletion("m2", row("m1", "premier"))).isNull()
    }

    @Test fun `une ligne sans dernier message n'est pas touchee`() {
        assertThat(row(null, "").revertingDeletion("m2", row("m1", "premier"))).isNull()
    }
}
