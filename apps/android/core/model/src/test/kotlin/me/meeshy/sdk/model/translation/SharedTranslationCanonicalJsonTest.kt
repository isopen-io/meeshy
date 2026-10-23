package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SharedTranslationCanonicalJsonTest {
    private fun json(text: String) = SharedTranslationSeal.canonicalInnerJson(SharedTranslationInner(text, "en", "e"))

    @Test
    fun `cles triees, sans espace, v en dernier`() {
        assertThat(json("a")).isEqualTo("{\"engine\":\"e\",\"sourceLanguage\":\"en\",\"text\":\"a\",\"v\":1}")
    }

    @Test
    fun `barres non echappees, guillemets et controles echappes comme JSON stringify`() {
        assertThat(json("a/b\"c\\d\n\t\r\b\u000C\u0001\u001f")).isEqualTo(
            "{\"engine\":\"e\",\"sourceLanguage\":\"en\",\"text\":\"a/b\\\"c\\\\d\\n\\t\\r\\b\\f\\u0001\\u001f\",\"v\":1}",
        )
    }

    @Test
    fun `emoji et arabe restent bruts`() {
        assertThat(json("👋 القهوة \u2028 \u007f")).contains("\"text\":\"👋 القهوة \u2028 \u007f\"")
    }
}
