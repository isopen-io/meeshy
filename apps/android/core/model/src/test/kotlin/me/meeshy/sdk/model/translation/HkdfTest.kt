package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HkdfTest {
    private fun hex(text: String): ByteArray = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    private fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }

    @Test
    fun `RFC 5869 cas 1`() {
        val okm = Hkdf.deriveKey(
            inputKeyMaterial = hex("0b".repeat(22)),
            salt = hex("000102030405060708090a0b0c"),
            info = hex("f0f1f2f3f4f5f6f7f8f9"),
            outputByteCount = 42,
        )
        assertThat(okm.hex()).isEqualTo(
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
        )
    }

    @Test
    fun `RFC 5869 cas 3 sans sel ni info`() {
        val okm = Hkdf.deriveKey(hex("0b".repeat(22)), ByteArray(0), ByteArray(0), 42)
        assertThat(okm.hex()).isEqualTo(
            "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8",
        )
    }

    @Test
    fun `RFC 5869 cas 2 sur plusieurs blocs`() {
        val okm = Hkdf.deriveKey(
            inputKeyMaterial = ByteArray(80) { (0x00 + it).toByte() },
            salt = ByteArray(80) { (0x60 + it).toByte() },
            info = ByteArray(80) { (0xb0 + it).toByte() },
            outputByteCount = 82,
        )
        assertThat(okm.hex()).isEqualTo(
            "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87",
        )
    }
}
