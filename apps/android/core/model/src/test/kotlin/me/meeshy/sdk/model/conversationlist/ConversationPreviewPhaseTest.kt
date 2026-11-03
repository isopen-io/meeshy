package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.conversationlist.ConversationPreviewIntent.Ensure
import me.meeshy.sdk.model.conversationlist.ConversationPreviewIntent.Open
import me.meeshy.sdk.model.conversationlist.ConversationPreviewIntent.Prefetch
import me.meeshy.sdk.model.conversationlist.ConversationPreviewProvenance.FreshCache
import me.meeshy.sdk.model.conversationlist.ConversationPreviewProvenance.Network
import me.meeshy.sdk.model.conversationlist.ConversationPreviewProvenance.StaleCache
import org.junit.Test

class ConversationPreviewPhaseTest {

    private fun message(
        id: String = "m1",
        content: String = "Hello",
        language: String? = "en",
        translations: List<ApiTextTranslation> = emptyList(),
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
        updatedAt: String? = null,
        editedAt: String? = null,
        deletedAt: String? = null,
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        content = content,
        originalLanguage = language,
        translations = translations,
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
        updatedAt = updatedAt,
        editedAt = editedAt,
        deletedAt = deletedAt,
    )

    private fun prefs(system: String?, regional: String? = null) = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage = system
        override val regionalLanguage = regional
        override val customDestinationLanguage: String? = null
    }

    private fun french(text: String = "Bonjour") = ApiTextTranslation(targetLanguage = "fr", translatedContent = text)

    @Test
    fun `une ouverture monte en gamme un prechargement en vol, jamais l inverse`() {
        assertThat(ConversationPreviewLaw.mustWaitThenRerun(running = Prefetch, requested = Open)).isTrue()
        assertThat(ConversationPreviewLaw.mustWaitThenRerun(running = Prefetch, requested = Ensure)).isTrue()
        assertThat(ConversationPreviewLaw.mustWaitThenRerun(running = Ensure, requested = Open)).isTrue()
        assertThat(ConversationPreviewLaw.mustWaitThenRerun(running = Open, requested = Ensure)).isFalse()
        assertThat(ConversationPreviewLaw.mustWaitThenRerun(running = Ensure, requested = Ensure)).isFalse()
        assertThat(ConversationPreviewLaw.mustWaitThenRerun(running = Open, requested = Prefetch)).isFalse()
    }

    @Test
    fun `le prechargement ne touche jamais le reseau`() {
        assertThat(ConversationPreviewLaw.needsNetwork(Prefetch, PreviewCacheReading.Absent)).isFalse()
        assertThat(ConversationPreviewLaw.needsNetwork(Prefetch, PreviewCacheReading.Stale)).isFalse()
    }

    @Test
    fun `l ouverture revalide toujours`() {
        assertThat(ConversationPreviewLaw.needsNetwork(Open, PreviewCacheReading.Fresh(hasMessages = true))).isTrue()
    }

    @Test
    fun `ensure ne revalide pas un cache frais non vide mais revalide le reste`() {
        assertThat(ConversationPreviewLaw.needsNetwork(Ensure, PreviewCacheReading.Fresh(hasMessages = true))).isFalse()
        assertThat(ConversationPreviewLaw.needsNetwork(Ensure, PreviewCacheReading.Fresh(hasMessages = false))).isTrue()
        assertThat(ConversationPreviewLaw.needsNetwork(Ensure, PreviewCacheReading.Stale)).isTrue()
        assertThat(ConversationPreviewLaw.needsNetwork(Ensure, PreviewCacheReading.Absent)).isTrue()
    }

    @Test
    fun `prefetch s arrete des que quelque chose est servi, ensure des que c est a jour, open jamais`() {
        assertThat(ConversationPreviewLaw.isSettled(Prefetch, null)).isFalse()
        assertThat(ConversationPreviewLaw.isSettled(Prefetch, StaleCache)).isTrue()
        assertThat(ConversationPreviewLaw.isSettled(Ensure, StaleCache)).isFalse()
        assertThat(ConversationPreviewLaw.isSettled(Ensure, FreshCache)).isTrue()
        assertThat(ConversationPreviewLaw.isSettled(Ensure, Network)).isTrue()
        assertThat(ConversationPreviewLaw.isSettled(Open, Network)).isFalse()
    }

    @Test
    fun `un resultat reseau n est jamais ecrase par un cache plus ancien`() {
        assertThat(ConversationPreviewLaw.mayPublishCache(held = Network)).isFalse()
        assertThat(ConversationPreviewLaw.mayPublishCache(held = StaleCache)).isTrue()
        assertThat(ConversationPreviewLaw.mayPublishCache(held = null)).isTrue()
        assertThat(ConversationPreviewLaw.provenanceOf(PreviewCacheReading.Fresh(true))).isEqualTo(FreshCache)
        assertThat(ConversationPreviewLaw.provenanceOf(PreviewCacheReading.Stale)).isEqualTo(StaleCache)
    }

    @Test
    fun `un message chiffre non dechiffrable est scelle, contenu et traductions vides`() {
        val sealed = ConversationPreviewSnapshot.of(
            messages = listOf(message(content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", translations = listOf(french()))),
            prefs = prefs("fr"),
        )

        assertThat(sealed.messages.single().content).isEmpty()
        assertThat(sealed.messages.single().translations).isEmpty()
        assertThat(sealed.servedTranslation("m1")).isNull()
    }

    @Test
    fun `un message en clair reste lisible`() {
        val snapshot = ConversationPreviewSnapshot.of(listOf(message(content = "Hello")), prefs("en"))

        assertThat(snapshot.messages.single().content).isEqualTo("Hello")
    }

    @Test
    fun `chaque message sert la traduction que le prisme elit, null veut dire l original`() {
        val snapshot = ConversationPreviewSnapshot.of(
            messages = listOf(
                message(id = "a", translations = listOf(french("Bonjour"))),
                message(id = "b", translations = emptyList()),
                message(id = "c", language = "fr", content = "Salut", translations = listOf(french("Salut"))),
            ),
            prefs = prefs("fr"),
        )

        assertThat(snapshot.servedText(snapshot.messages[0])).isEqualTo("Bonjour")
        assertThat(snapshot.servedLanguage("a")).isEqualTo("fr")
        assertThat(snapshot.servedText(snapshot.messages[1])).isEqualTo("Hello")
        assertThat(snapshot.servedLanguage("b")).isNull()
        assertThat(snapshot.servedLanguage("c")).isNull()
    }

    @Test
    fun `la descente se fait rang par rang, sans repli sur la premiere traduction`() {
        val spanish = ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola")
        val snapshot = ConversationPreviewSnapshot.of(
            messages = listOf(message(translations = listOf(spanish))),
            prefs = prefs(system = "fr", regional = "es"),
        )

        assertThat(snapshot.servedLanguage("m1")).isEqualTo("es")
        val none = ConversationPreviewSnapshot.of(listOf(message(translations = listOf(spanish))), prefs("fr"))
        assertThat(none.servedLanguage("m1")).isNull()
    }

    @Test
    fun `l empreinte ne bouge pas quand rien n a change`() {
        val a = ConversationPreviewFingerprint.of(ConversationPreviewPhase.Loaded, ConversationPreviewSnapshot.of(listOf(message()), prefs("en")))
        val b = ConversationPreviewFingerprint.of(ConversationPreviewPhase.Loaded, ConversationPreviewSnapshot.of(listOf(message()), prefs("en")))

        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `l empreinte change pour un message modifie, supprime, servi dans une autre langue ou deverrouille`() {
        fun fp(m: ApiMessage, p: String? = "en") =
            ConversationPreviewFingerprint.of(ConversationPreviewPhase.Loaded, ConversationPreviewSnapshot.of(listOf(m), prefs(p)))
        val base = fp(message())

        assertThat(fp(message(updatedAt = "2026-01-01T00:00:00Z"))).isNotEqualTo(base)
        assertThat(fp(message(editedAt = "2026-01-01T00:00:00Z"))).isNotEqualTo(base)
        assertThat(fp(message(deletedAt = "2026-01-01T00:00:00Z"))).isNotEqualTo(base)
        assertThat(fp(message(translations = listOf(french())), "fr")).isNotEqualTo(base)
        assertThat(fp(message(isEncrypted = true, encryptionMode = "e2ee", content = "[Encrypted]"))).isNotEqualTo(base)
    }

    @Test
    fun `la phase fait partie de l empreinte`() {
        val empty = ConversationPreviewSnapshot.of(emptyList(), prefs("en"))

        assertThat(ConversationPreviewFingerprint.of(ConversationPreviewPhase.Empty, empty))
            .isNotEqualTo(ConversationPreviewFingerprint.of(ConversationPreviewPhase.Unavailable, empty))
    }

    @Test
    fun `seuls les cinq derniers messages sont gardes, du plus ancien au plus recent`() {
        val seven = (1..7).map { message(id = "m$it") }

        val snapshot = ConversationPreviewSnapshot.of(seven, prefs("en"))

        assertThat(snapshot.messages.map { it.id }).containsExactly("m3", "m4", "m5", "m6", "m7").inOrder()
    }
}
