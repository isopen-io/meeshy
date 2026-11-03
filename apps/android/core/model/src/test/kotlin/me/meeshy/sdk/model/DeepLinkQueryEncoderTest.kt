package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DeepLinkQueryEncoderTest {
    @Test
    fun `the reserved separators are percent encoded`() {
        assertThat(DeepLinkQueryEncoder.encode("a&b=c+d?e#f")).isEqualTo("a%26b%3Dc%2Bd%3Fe%23f")
    }

    @Test
    fun `spaces and emoji are encoded as utf-8`() {
        assertThat(DeepLinkQueryEncoder.encode("ce soir 😀")).isEqualTo("ce%20soir%20%F0%9F%98%80")
    }

    @Test
    fun `plain text and url safe punctuation stay readable`() {
        assertThat(DeepLinkQueryEncoder.encode("abc-XYZ_09.~!,:;/@")).isEqualTo("abc-XYZ_09.~!,:;/@")
    }

    @Test
    fun `accents and percent are encoded`() {
        assertThat(DeepLinkQueryEncoder.encode("é100%")).isEqualTo("%C3%A9100%25")
    }
}
