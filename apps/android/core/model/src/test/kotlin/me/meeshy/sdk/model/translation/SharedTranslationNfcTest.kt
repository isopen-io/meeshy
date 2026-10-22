package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

class SharedTranslationNfcTest {
    private fun binding(source: String) = SharedTranslationBinding("64f0c0ffee0000000000c0de", "64f0c0ffee0000000000a001", "fr", source)
    private val composed = "caf\u00e9"
    private val decomposed = "cafe\u0301"
    private val key = SharedTranslationKeySource.MessageContent

    @Test
    fun `texte compose et decompose donnent la meme cle et la meme empreinte`() {
        assertThat(SharedTranslationSeal.derivedKey(binding(composed), key)).isEqualTo(SharedTranslationSeal.derivedKey(binding(decomposed), key))
        assertThat(SharedTranslationSeal.sourceDigest(composed)).isEqualTo(SharedTranslationSeal.sourceDigest(decomposed))
    }

    @Test
    fun `une enveloppe scellee sur le texte compose s'ouvre sur le decompose`() {
        val inner = SharedTranslationInner("coffee", "fr", "e")
        val envelope = SharedTranslationSeal.seal(binding(composed), key, inner)
        assertThat(SharedTranslationSeal.open(binding(decomposed), key, envelope)).isEqualTo(inner)
    }

    @Test
    fun `une demi-paire de substitution est rejetee`() {
        val lone = "a\ud83d"
        assertThat(assertThrows(SharedTranslationSealException::class.java) {
            SharedTranslationSeal.seal(binding(lone), key, SharedTranslationInner("x", "fr", "e"))
        }.failure).isEqualTo(SharedTranslationSealFailure.INVALID_BINDING)
        assertThat(assertThrows(SharedTranslationSealException::class.java) {
            SharedTranslationSeal.seal(binding(composed), key, SharedTranslationInner("\udc00", "fr", "e"))
        }.failure).isEqualTo(SharedTranslationSealFailure.INVALID_INNER)
        val ok = SharedTranslationSeal.seal(binding(composed), key, SharedTranslationInner("x", "fr", "e"))
        assertThat(SharedTranslationSeal.open(binding(lone), key, ok)).isNull()
    }
}
