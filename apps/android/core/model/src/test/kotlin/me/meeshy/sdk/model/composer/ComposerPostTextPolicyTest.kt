package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le texte d'un post ou d'un réel tient dans le plafond du serveur (5 000 unités UTF-16), comme iOS `ComposerPostTextPolicy`. */
class ComposerPostTextPolicyTest {

    @Test
    fun `the limit counts UTF-16 units like the server, an emoji weighs two`() {
        assertThat(ComposerPostTextPolicy.length("é")).isEqualTo(1)
        assertThat(ComposerPostTextPolicy.length("😀")).isEqualTo(2)
        assertThat(ComposerPostTextPolicy.isOverLimit("a".repeat(5000))).isFalse()
        assertThat(ComposerPostTextPolicy.isOverLimit("a".repeat(5001))).isTrue()
    }

    @Test
    fun `a text over the limit is cut at the last whole character, never inside an emoji`() {
        val text = "a".repeat(4999) + "😀"

        val cut = ComposerPostTextPolicy.truncate(text)

        assertThat(cut).isEqualTo("a".repeat(4999))
        assertThat(ComposerPostTextPolicy.truncate("bonjour")).isEqualTo("bonjour")
        assertThat(ComposerPostTextPolicy.truncate("a".repeat(6000))).hasLength(5000)
    }

    @Test
    fun `the counter appears from four thousand and warns from four thousand five hundred`() {
        assertThat(ComposerPostTextPolicy.counter("a".repeat(3999))).isNull()
        assertThat(ComposerPostTextPolicy.counter("a".repeat(4000))).isEqualTo(ComposerPostTextPolicy.Counter(used = 4000, limit = 5000, warns = false))
        assertThat(ComposerPostTextPolicy.counter("a".repeat(4500))?.warns).isTrue()
    }
}
