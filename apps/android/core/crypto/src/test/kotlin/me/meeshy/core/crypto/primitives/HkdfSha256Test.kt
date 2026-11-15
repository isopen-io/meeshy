package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HkdfSha256Test {
    @Test
    fun `RFC 5869 A1 cas de base`() {
        val okm = HkdfSha256.derive(
            "0b".repeat(22).hex(), "000102030405060708090a0b0c".hex(), "f0f1f2f3f4f5f6f7f8f9".hex(), 42,
        )
        assertThat(okm.toHex()).isEqualTo(
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
        )
    }

    @Test
    fun `RFC 5869 A2 entrees longues`() {
        val okm = HkdfSha256.derive(
            (0x00..0x4f).map { it.toByte() }.toByteArray(),
            (0x60..0xaf).map { it.toByte() }.toByteArray(),
            (0xb0..0xff).map { it.toByte() }.toByteArray(),
            82,
        )
        assertThat(okm.toHex()).isEqualTo(
            "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c" +
                "59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71" +
                "cc30c58179ec3e87c14c01d5c1f3434f1d87",
        )
    }

    @Test
    fun `RFC 5869 A3 sel et info vides`() {
        val okm = HkdfSha256.derive("0b".repeat(22).hex(), ByteArray(0), ByteArray(0), 42)
        assertThat(okm.toHex()).isEqualTo(
            "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8",
        )
    }

    @Test
    fun `une longueur hors limites est refusee sans fuite`() {
        val error = runCatching { HkdfSha256.derive(ByteArray(1), ByteArray(0), ByteArray(0), 0) }.exceptionOrNull()
        assertThat(error).isInstanceOf(CryptoException::class.java)
    }
}
