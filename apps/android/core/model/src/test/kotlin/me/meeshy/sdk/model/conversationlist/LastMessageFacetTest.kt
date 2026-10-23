package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class LastMessageFacetTest {

    private fun message(
        id: String = "m2",
        senderId: String? = "u-bob",
        content: String = "Hello",
        createdAt: String = "2026-10-01T10:00:00.000Z",
        sender: ApiMessageSender? = ApiMessageSender(userId = "u-bob", displayName = "Bob"),
        translations: List<ApiTextTranslation> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
        location: SharedPlace? = null,
        isEncrypted: Boolean? = null,
    ) = ApiMessage(
        id = id, conversationId = "c1", senderId = senderId, content = content, createdAt = createdAt,
        sender = sender, translations = translations, attachments = attachments, location = location,
        originalLanguage = "en", isEncrypted = isEncrypted,
    )

    private fun facet(message: ApiMessage, reader: String? = "u-me", languages: List<String> = emptyList()) =
        LastMessageFacet.of(message, readerId = reader, youLabel = "Vous", viewerLanguages = languages)

    @Test
    fun `author is resolved to the served name for a peer`() {
        val f = facet(message())
        assertThat(f.senderName).isEqualTo("Bob")
        assertThat(f.senderUserId).isEqualTo("u-bob")
    }

    @Test
    fun `my own message says You and carries no peer id`() {
        val f = facet(message(senderId = "u-me", sender = ApiMessageSender(userId = "u-me", displayName = "Moi")))
        assertThat(f.senderName).isEqualTo("Vous")
        assertThat(f.senderUserId).isNull()
    }

    @Test
    fun `a thin echo without sender envelope has no author, never the previous one`() {
        val f = facet(message(senderId = null, sender = null))
        assertThat(f.senderName).isNull()
        val previous = ApiConversation(id = "c1", lastMessage = ApiConversationLastMessage(id = "m1", senderName = "Alice"))
        assertThat(previous.applyingLastMessage(f).lastMessage?.senderName).isNull()
    }

    @Test
    fun `translations are replaced by the ones of the frame and restricted to the viewer languages`() {
        val f = facet(
            message(
                translations = listOf(
                    ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
                    ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
                ),
            ),
            languages = listOf("fr"),
        )
        val old = ApiConversation(id = "c1", lastMessageTranslations = mapOf("de" to "Hallo"))
        val patched = old.applyingLastMessage(f)
        assertThat(patched.lastMessageTranslations).containsExactly("fr", "Bonjour")
        assertThat(patched.lastMessageOriginalLanguage).isEqualTo("en")
    }

    @Test
    fun `an encrypted message never leaks its ciphertext into the preview`() {
        val f = facet(message(content = "Zm9v", isEncrypted = true))
        assertThat(f.preview).isNull()
    }

    @Test
    fun `location of the new message replaces the one of the previous message`() {
        val place = SharedPlace(latitude = 1.0, longitude = 2.0, name = "Cafe")
        val old = ApiConversation(id = "c1", lastMessage = ApiConversationLastMessage(id = "m1", location = place))
        assertThat(old.applyingLastMessage(facet(message())).lastMessage?.location).isNull()
        assertThat(old.applyingLastMessage(facet(message(location = place))).lastMessage?.location).isEqualTo(place)
    }

    @Test
    fun `attachments of the new message replace those of the old one`() {
        val photo = ApiMessageAttachment(id = "a1", mimeType = "image/jpeg", fileSize = 10)
        val patched = ApiConversation(id = "c1").applyingLastMessage(facet(message(attachments = listOf(photo))))
        assertThat(patched.lastMessage?.attachments).containsExactly(photo)
        assertThat(patched.lastMessage?.nature?.attachmentSummary?.kinds).containsExactly("image", 1)
    }

    @Test
    fun `order guard admits newer or same message and rejects older`() {
        val conv = ApiConversation(
            id = "c1",
            lastMessage = ApiConversationLastMessage(id = "m5", createdAt = "2026-10-01T10:00:00.000Z"),
        )
        val newer = 1_790_000_000_000L
        assertThat(conv.admitsLastMessage("m6", isoMillis("2026-10-01T10:00:01.000Z"))).isTrue()
        assertThat(conv.admitsLastMessage("m5", isoMillis("2026-10-01T09:00:00.000Z"))).isTrue()
        assertThat(conv.admitsLastMessage("m4", isoMillis("2026-10-01T09:59:59.000Z"))).isFalse()
        assertThat(conv.admitsLastMessage("m3", isoMillis("2026-10-01T09:00:00.000Z"), aliases = listOf("m5"))).isTrue()
        assertThat(newer).isGreaterThan(0)
    }

    private fun isoMillis(iso: String) = me.meeshy.sdk.model.isoToEpochMillisOrNull(iso)

    @Test
    fun `clearing the last message empties the preview group`() {
        val conv = ApiConversation(
            id = "c1",
            lastMessage = ApiConversationLastMessage(id = "m1", content = "x"),
            lastMessageTranslations = mapOf("fr" to "x"),
            lastMessageOriginalLanguage = "en",
        )
        val cleared = conv.clearingLastMessage()
        assertThat(cleared.lastMessage).isNull()
        assertThat(cleared.lastMessageTranslations).isNull()
    }
}
