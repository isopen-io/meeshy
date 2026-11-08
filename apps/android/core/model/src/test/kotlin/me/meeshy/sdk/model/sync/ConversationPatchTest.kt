package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.conversationlist.LastMessageFacet
import org.junit.Test

class ConversationPatchTest {
    private fun row(unread: Int = 0, lastId: String? = "m0") = ApiConversation(
        id = "c1",
        unreadCount = unread,
        lastMessage = lastId?.let {
            ApiConversationLastMessage(id = it, content = "avant", createdAt = "2026-11-03T09:00:00.000Z")
        },
    )

    private fun facet(
        id: String = "m1",
        at: String = "2026-11-03T10:00:00.000Z",
        translations: List<ApiTextTranslation> = emptyList(),
        language: String? = "en",
        senderId: String = "peer",
    ) = LastMessageFacet.of(
        message = ApiMessage(
            id = id, conversationId = "c1", senderId = senderId, content = "hello", createdAt = at,
            originalLanguage = language, translations = translations,
        ),
        readerId = "me",
        youLabel = "Vous",
        viewerLanguages = listOf("fr", "en"),
    )

    @Test
    fun `un message recu conversation fermee monte le non-lu et remplace l'apercu`() {
        val next = ConversationPatch.receivingMessage(row(unread = 2), facet(), countsAsUnread = true)
        assertThat(next.unreadCount).isEqualTo(3)
        assertThat(next.lastMessage?.id).isEqualTo("m1")
    }

    @Test
    fun `le meme message plie deux fois ne monte le non-lu qu'une fois`() {
        val once = ConversationPatch.receivingMessage(row(), facet(), countsAsUnread = true)
        val twice = ConversationPatch.receivingMessage(once, facet(), countsAsUnread = true)
        assertThat(twice).isEqualTo(once)
        assertThat(twice.unreadCount).isEqualTo(1)
    }

    @Test
    fun `conversation ouverte ou message de soi ne montent pas le non-lu`() {
        val next = ConversationPatch.receivingMessage(row(), facet(), countsAsUnread = false)
        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.lastMessage?.id).isEqualTo("m1")
    }

    @Test
    fun `un message plus ancien que l'apercu ne le regresse pas`() {
        val base = row(unread = 1)
        val next = ConversationPatch.receivingMessage(base, facet(at = "2026-11-03T08:00:00.000Z"), countsAsUnread = true)
        assertThat(next).isEqualTo(base)
    }

    @Test
    fun `l'alias optimiste du meme envoi ne compte pas comme un nouveau message`() {
        val base = row(lastId = "cid_1")
        val next = ConversationPatch.receivingMessage(base, facet(), aliases = listOf("cid_1"), countsAsUnread = true)
        assertThat(next.unreadCount).isEqualTo(0)
        assertThat(next.lastMessage?.id).isEqualTo("m1")
    }

    @Test
    fun `l'apercu porte la traduction du rang eligible et jamais la premiere venue`() {
        val translations = listOf(
            ApiTextTranslation(targetLanguage = "es", translatedContent = "hola"),
            ApiTextTranslation(targetLanguage = "fr", translatedContent = "bonjour"),
        )
        val next = ConversationPatch.receivingMessage(row(), facet(translations = translations), countsAsUnread = true)
        assertThat(next.lastMessageTranslations).containsExactly("fr", "bonjour")
    }

    @Test
    fun `sans traduction du lecteur l'apercu garde l'original`() {
        val translations = listOf(ApiTextTranslation(targetLanguage = "es", translatedContent = "hola"))
        val next = ConversationPatch.receivingMessage(row(), facet(translations = translations), countsAsUnread = true)
        assertThat(next.lastMessageTranslations).isNull()
        assertThat(next.lastMessage?.content).isEqualTo("hello")
    }
}
