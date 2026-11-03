package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import org.junit.Test

/**
 * #14632 — mettre en favori un message d'une conversation chiffrée de bout en bout n'écrit pas son clair dans le magasin
 * des favoris (SharedPreferences, hors du coffre) : l'extrait est vide, le favori garde le reste (conversation, auteur,
 * date) pour retrouver le message.
 */
class ChatStarSnapshotTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun bubble(message: ApiMessage) = BubbleContentBuilder.build(message, currentUserId = "me", preferences = prefs)

    private fun snapshot(message: ApiMessage, conversationIsEndToEnd: Boolean) = ChatStarSnapshot.of(
        bubble = bubble(message),
        conversationId = "c1",
        conversationName = "Bob",
        accentColorHex = null,
        senderAvatarUrl = null,
        conversationIsEndToEnd = conversationIsEndToEnd,
        nowMillis = 42L,
    )

    @Test
    fun `an opened end to end message is starred without its plaintext`() {
        val opened = ApiMessage(id = "m1", conversationId = "c1", senderId = "bob", content = "mon secret", isEncrypted = false, encryptionMode = "e2ee")

        val star = snapshot(opened, conversationIsEndToEnd = false)

        assertThat(star.contentPreview).isEmpty()
        assertThat(star.messageId).isEqualTo("m1")
        assertThat(star.conversationId).isEqualTo("c1")
    }

    @Test
    fun `any message of an end to end conversation is starred without its text`() {
        val clearBeforeActivation = ApiMessage(id = "m2", conversationId = "c1", senderId = "bob", content = "écrit avant")

        assertThat(snapshot(clearBeforeActivation, conversationIsEndToEnd = true).contentPreview).isEmpty()
    }

    @Test
    fun `a clear message keeps its preview`() {
        val clear = ApiMessage(id = "m3", conversationId = "c1", senderId = "bob", content = "yo")

        val star = snapshot(clear, conversationIsEndToEnd = false)

        assertThat(star.contentPreview).isEqualTo("yo")
        assertThat(star.starredAtMillis).isEqualTo(42L)
    }
}
