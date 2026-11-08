package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

class ConversationSearchResultTest {

    private fun message(
        content: String = "Hello world",
        translations: List<ApiTextTranslation> = emptyList(),
        sender: ApiMessageSender? = ApiMessageSender(id = "u1", displayName = "Ada", username = "ada", avatar = "https://a/1.png"),
    ) = ApiMessage(id = "m1", conversationId = "c1", content = content, translations = translations, sender = sender, createdAt = "2026-01-01T10:00:00.000Z")

    private fun translation(lang: String, text: String) = ApiTextTranslation(targetLanguage = lang, translatedContent = text)

    @Test
    fun `une requete rognee de moins de deux caracteres n'est pas cherchable`() {
        assertThat(ConversationSearchResults.searchable("  a ")).isNull()
        assertThat(ConversationSearchResults.searchable("")).isNull()
        assertThat(ConversationSearchResults.searchable("   ")).isNull()
    }

    @Test
    fun `une requete de deux caracteres ou plus est rognee`() {
        assertThat(ConversationSearchResults.searchable("  he ")).isEqualTo("he")
    }

    @Test
    fun `le contenu est teste avant les traductions`() {
        val result = ConversationSearchResults.from(message(translations = listOf(translation("fr", "Bonjour hello"))), "hello")

        assertThat(result.matchType).isEqualTo(SearchMatchType.CONTENT)
        assertThat(result.matchedText).isEqualTo("Hello world")
    }

    @Test
    fun `une correspondance de traduction est signalee avec le texte traduit`() {
        val result = ConversationSearchResults.from(
            message(translations = listOf(translation("es", "Hola mundo"), translation("fr", "Bonjour le monde"))),
            "BONJOUR",
        )

        assertThat(result.matchType).isEqualTo(SearchMatchType.TRANSLATION)
        assertThat(result.matchedText).isEqualTo("Bonjour le monde")
        assertThat(result.content).isEqualTo("Hello world")
    }

    @Test
    fun `sans correspondance visible le contenu reste affiche`() {
        val result = ConversationSearchResults.from(message(), "zzz")

        assertThat(result.matchType).isEqualTo(SearchMatchType.CONTENT)
        assertThat(result.matchedText).isEqualTo("Hello world")
    }

    @Test
    fun `l'expediteur prefere le nom affiche puis le pseudo puis un point d'interrogation`() {
        assertThat(ConversationSearchResults.from(message(), "hello").senderName).isEqualTo("Ada")
        assertThat(ConversationSearchResults.from(message(sender = ApiMessageSender(username = "ada")), "hello").senderName).isEqualTo("ada")
        assertThat(ConversationSearchResults.from(message(sender = null), "hello").senderName).isEqualTo("?")
        assertThat(ConversationSearchResults.from(message(), "hello").senderAvatar).isEqualTo("https://a/1.png")
    }

    @Test
    fun `la fusion ajoute les resultats serveur sans doublon, les locaux d'abord`() {
        val merged = ConversationSearchResults.mergeIds(local = listOf("a", "b"), server = listOf("b", "c", "a", "d"))

        assertThat(merged).containsExactly("a", "b", "c", "d").inOrder()
    }
}
