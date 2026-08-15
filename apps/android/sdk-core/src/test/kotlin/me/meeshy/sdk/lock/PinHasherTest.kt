package me.meeshy.sdk.lock

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PinHasherTest {

    @Test
    fun `hash is deterministic for the same pin`() {
        assertThat(PinHasher.hash("123456")).isEqualTo(PinHasher.hash("123456"))
    }

    @Test
    fun `hash differs between different pins`() {
        assertThat(PinHasher.hash("123456")).isNotEqualTo(PinHasher.hash("654321"))
    }

    @Test
    fun `hash never contains the plaintext pin`() {
        assertThat(PinHasher.hash("123456")).doesNotContain("123456")
    }

    @Test
    fun `hash is a 64-character lowercase hex string (SHA-256)`() {
        val hash = PinHasher.hash("1234")

        assertThat(hash).hasLength(64)
        assertThat(hash).matches("[0-9a-f]+")
    }
}
