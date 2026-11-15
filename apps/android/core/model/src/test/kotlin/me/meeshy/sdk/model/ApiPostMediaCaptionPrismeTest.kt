package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `ApiPostMedia.resolvedCaption` — the Prisme Linguistique descent on `PostMedia.caption`
 * (#6280). Same rank-3 rule as `LastMessagePreviewResolverTest`: written at rank 2 (not
 * rank 1), per Leçon 261 — a rank-1 witness cannot fall on the short-circuit-vs-ordered-rank
 * bug because both readings agree there.
 */
class ApiPostMediaCaptionPrismeTest {

    private fun media(
        caption: String? = "Bonjour",
        captionLanguage: String? = "fr",
        captionTranslations: Map<String, ApiMediaCaptionTranslationEntry>? = null,
    ) = ApiPostMedia(id = "m1", caption = caption, captionLanguage = captionLanguage, captionTranslations = captionTranslations)

    @Test
    fun `no captionTranslations returns the raw caption`() {
        assertThat(media().resolvedCaption(listOf("en"))).isEqualTo("Bonjour")
    }

    @Test
    fun `no caption at all resolves to null`() {
        assertThat(media(caption = null, captionLanguage = null).resolvedCaption(listOf("en"))).isNull()
    }

    @Test
    fun `serves the preferred-language translation`() {
        val m = media(
            captionTranslations = mapOf(
                "en" to ApiMediaCaptionTranslationEntry(text = "Hello"),
                "es" to ApiMediaCaptionTranslationEntry(text = "Hola"),
            ),
        )
        assertThat(m.resolvedCaption(listOf("es", "en"))).isEqualTo("Hola")
    }

    @Test
    fun `original language wins at its own rank — never a global short-circuit`() {
        // Prism ["en","fr"], caption originally FRENCH, an English translation exists.
        // Rank 1 (en) has an English translation -> served, even though 'fr' (the
        // original language) also sits in the prism at rank 2. This is rank 1, so it
        // cannot distinguish the short-circuit reading from the ordered-rank reading —
        // see the rank-2 witness below for that.
        val m = media(
            caption = "Bonjour",
            captionLanguage = "fr",
            captionTranslations = mapOf("en" to ApiMediaCaptionTranslationEntry(text = "Hello")),
        )
        assertThat(m.resolvedCaption(listOf("en", "fr"))).isEqualTo("Hello")
    }

    @Test
    fun `a match at RANK 2 is served when rank 1 has none (Lecon 261 — never test rank 1 alone)`() {
        // Prism ["de","en"], caption originally FRENCH, an English translation exists.
        // Rank 1 ("de") has no translation and isn't the original -> keep walking.
        // Rank 2 ("en") has a translation -> served. A resolver that stopped at rank 1
        // (or fell back to the raw caption too early) would fail this, unlike a
        // rank-1-only witness which any reasonable implementation passes trivially.
        val m = media(
            caption = "Bonjour",
            captionLanguage = "fr",
            captionTranslations = mapOf("en" to ApiMediaCaptionTranslationEntry(text = "Hello")),
        )
        assertThat(m.resolvedCaption(listOf("de", "en"))).isEqualTo("Hello")
    }

    @Test
    fun `blank translation is ignored, never surfaces over the original`() {
        val m = media(captionTranslations = mapOf("en" to ApiMediaCaptionTranslationEntry(text = "   ")))
        assertThat(m.resolvedCaption(listOf("en"))).isEqualTo("Bonjour")
    }

    @Test
    fun `no match in the prism falls back to the raw caption, never an arbitrary translation`() {
        val m = media(
            captionTranslations = mapOf("en" to ApiMediaCaptionTranslationEntry(text = "Hello")),
        )
        assertThat(m.resolvedCaption(listOf("de"))).isEqualTo("Bonjour")
    }
}
