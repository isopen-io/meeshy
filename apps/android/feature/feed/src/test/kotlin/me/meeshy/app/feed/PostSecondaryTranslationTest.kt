package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

class PostSecondaryTranslationTest {

    private val post = ApiPost(
        id = "p1",
        content = "Hola",
        originalLanguage = "es",
        translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello"), "de" to ApiPostTranslationEntry(text = " ")),
    )

    @Test
    fun `a translation under the read text carries its own text and language`() {
        val panel = PostSecondaryTranslation.of(post, secondaryCode = "en", activeCode = "es")!!

        assertThat(panel.content).isEqualTo("Hello")
        assertThat(panel.info?.code).isEqualTo("en")
    }

    @Test
    fun `no requested language means no panel`() {
        assertThat(PostSecondaryTranslation.of(post, null, "es")).isNull()
    }

    @Test
    fun `the language already read is never repeated beneath itself`() {
        assertThat(PostSecondaryTranslation.of(post, "en", activeCode = "EN")).isNull()
    }

    @Test
    fun `a language without content draws nothing instead of an empty panel`() {
        assertThat(PostSecondaryTranslation.of(post, "de", "es")).isNull()
        assertThat(PostSecondaryTranslation.of(post, "ja", "es")).isNull()
    }

    @Test
    fun `the original can be shown beneath a translation`() {
        assertThat(PostSecondaryTranslation.of(post, "es", activeCode = "en")!!.content).isEqualTo("Hola")
    }
}
