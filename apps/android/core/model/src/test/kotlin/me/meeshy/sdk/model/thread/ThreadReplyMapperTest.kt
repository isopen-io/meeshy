package me.meeshy.sdk.model.thread

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

class ThreadReplyMapperTest {

    private fun api(
        id: String = "m1",
        content: String = "Hello",
        lang: String? = "en",
        translations: List<ApiTextTranslation> = emptyList(),
        deletedAt: String? = null,
        senderId: String? = "u2",
        isEncrypted: Boolean? = null,
        createdAt: String? = "2026-01-01T10:00:00Z",
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = senderId,
        content = content,
        originalLanguage = lang,
        translations = translations,
        deletedAt = deletedAt,
        createdAt = createdAt,
        isEncrypted = isEncrypted,
        clientMessageId = "cid_$id",
        sender = ApiMessageSender(userId = senderId, displayName = "Bob", username = "bob", avatar = "a.png"),
    )

    private fun fr(text: String) = ApiTextTranslation(targetLanguage = "fr", translatedContent = text)
    private fun es(text: String) = ApiTextTranslation(targetLanguage = "es", translatedContent = text)

    @Test
    fun `le texte servi descend le prisme et le rang 2 sert quand le rang 1 manque`() {
        val mapped = ThreadReplyMapper.fromApi(
            api(translations = listOf(es("Hola"))),
            currentUserId = "me",
            prism = listOf("fr", "es"),
        )
        assertThat(mapped?.text).isEqualTo("Hola")
    }

    @Test
    fun `sans traduction vers le prisme l'original est servi`() {
        val mapped = ThreadReplyMapper.fromApi(api(translations = listOf(es("Hola"))), "me", listOf("fr"))
        assertThat(mapped?.text).isEqualTo("Hello")
    }

    @Test
    fun `la traduction francaise sert au-dessus de l'original anglais`() {
        val mapped = ThreadReplyMapper.fromApi(api(translations = listOf(fr("Bonjour"))), "me", listOf("fr", "en"))
        assertThat(mapped?.text).isEqualTo("Bonjour")
    }

    @Test
    fun `un message supprime ou chiffre n'est jamais rendu`() {
        assertThat(ThreadReplyMapper.fromApi(api(deletedAt = "2026-01-01T11:00:00Z"), "me", listOf("fr"))).isNull()
        assertThat(ThreadReplyMapper.fromApi(api(isEncrypted = true), "me", listOf("fr"))).isNull()
    }

    @Test
    fun `l'auteur et l'horloge serveur sont projetes`() {
        val mapped = ThreadReplyMapper.fromApi(api(), currentUserId = "u2", prism = listOf("en"))!!
        assertThat(mapped.isMine).isTrue()
        assertThat(mapped.senderName).isEqualTo("Bob")
        assertThat(mapped.clientMessageId).isEqualTo("cid_m1")
        assertThat(mapped.createdAtMillis).isEqualTo(1767261600000L)
        assertThat(mapped.status).isEqualTo(ThreadReplyStatus.SENT)
    }
}
