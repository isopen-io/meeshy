package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RenderFingerprintTest {

    private fun conv(
        unread: Int = 0,
        preview: String = "salut",
        online: Boolean? = null,
        translations: Map<String, String>? = null,
        capped: Boolean? = null,
        pinned: Boolean = false,
    ) = ApiConversation(
        id = "c",
        title = "Groupe",
        unreadCount = unread,
        lastMessage = ApiConversationLastMessage(id = "m", content = preview, createdAt = "2026-01-01T00:00:00Z"),
        participants = listOf(ApiParticipant(id = "p", userId = "u", isOnline = online, lastActiveAt = online?.let { "2026-01-01T00:00:00Z" })),
        lastMessageTranslations = translations,
        serverMemberCount = 199,
        memberCountCapped = capped,
        preferences = ApiConversationPreferences(isPinned = pinned),
    )

    private fun fp(c: ApiConversation) = c.renderFingerprint()

    @Test
    fun `deux lignes identiques ont la meme empreinte`() {
        assertThat(fp(conv())).isEqualTo(fp(conv()))
    }

    @Test
    fun `la presence d un participant ne change pas l empreinte`() {
        assertThat(fp(conv(online = true))).isEqualTo(fp(conv(online = false)))
    }

    @Test
    fun `un champ affiche change l empreinte`() {
        val base = fp(conv())
        assertThat(fp(conv(unread = 1))).isNotEqualTo(base)
        assertThat(fp(conv(preview = "autre"))).isNotEqualTo(base)
        assertThat(fp(conv(pinned = true))).isNotEqualTo(base)
    }

    @Test
    fun `199 et 199 plus se distinguent a nombre egal`() {
        assertThat(fp(conv(capped = true))).isNotEqualTo(fp(conv(capped = false)))
    }

    @Test
    fun `une retraduction change l empreinte et l ordre des cles non`() {
        val a = fp(conv(translations = mapOf("fr" to "bonjour", "en" to "hello")))
        assertThat(fp(conv(translations = mapOf("en" to "hello", "fr" to "bonjour")))).isEqualTo(a)
        assertThat(fp(conv(translations = mapOf("fr" to "salut", "en" to "hello")))).isNotEqualTo(a)
    }
}
