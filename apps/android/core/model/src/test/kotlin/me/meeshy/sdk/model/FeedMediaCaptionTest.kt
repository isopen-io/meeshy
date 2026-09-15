package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `FeedMedia.resolvedCaption` — the flattened-map sibling of
 * `ApiPostMediaCaptionPrismeTest` (#6280). Both project the same
 * `resolveLastMessagePreview` law; this one over the wire-flattened
 * `Map<String, String>` shape stories carry.
 */
class FeedMediaCaptionTest {

    private fun feedMedia(
        caption: String? = "Bonjour",
        captionLanguage: String? = "fr",
        captionTranslations: Map<String, String>? = null,
    ) = FeedMedia(id = "m1", caption = caption, captionLanguage = captionLanguage, captionTranslations = captionTranslations)

    @Test
    fun `no translations returns the raw caption`() {
        assertThat(feedMedia().resolvedCaption(listOf("en"))).isEqualTo("Bonjour")
    }

    @Test
    fun `no caption at all resolves to null`() {
        assertThat(feedMedia(caption = null, captionLanguage = null).resolvedCaption(listOf("en"))).isNull()
    }

    @Test
    fun `serves the preferred-language translation`() {
        val m = feedMedia(captionTranslations = mapOf("en" to "Hello", "es" to "Hola"))
        assertThat(m.resolvedCaption(listOf("es", "en"))).isEqualTo("Hola")
    }

    @Test
    fun `a rank-2 match is served when rank 1 has none — never a short-circuit on the original`() {
        val m = feedMedia(caption = "Bonjour", captionLanguage = "fr", captionTranslations = mapOf("en" to "Hello"))
        assertThat(m.resolvedCaption(listOf("de", "en"))).isEqualTo("Hello")
    }

    @Test
    fun `no match in the prism falls back to the raw caption`() {
        val m = feedMedia(captionTranslations = mapOf("en" to "Hello"))
        assertThat(m.resolvedCaption(listOf("de"))).isEqualTo("Bonjour")
    }
}
