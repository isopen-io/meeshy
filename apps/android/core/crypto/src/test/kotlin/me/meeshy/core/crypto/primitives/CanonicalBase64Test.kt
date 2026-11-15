package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CanonicalBase64Test {
    @Test
    fun `aller retour pour toutes les longueurs`() {
        (0..9).forEach { size ->
            val bytes = ByteArray(size) { (it * 37 + 1).toByte() }
            assertThat(CanonicalBase64.decode(CanonicalBase64.encode(bytes))).isEqualTo(bytes)
        }
    }

    @Test
    fun `les blancs sont refuses`() {
        assertThat(CanonicalBase64.decode("QUJD\n")).isNull()
        assertThat(CanonicalBase64.decode("QU JD")).isNull()
        assertThat(CanonicalBase64.decode(" QUJD")).isNull()
    }

    @Test
    fun `le remplissage absent est refuse`() {
        assertThat(CanonicalBase64.decode("QQ")).isNull()
        assertThat(CanonicalBase64.decode("QQ==")).isEqualTo(byteArrayOf(0x41))
    }

    @Test
    fun `les bits de remplissage non nuls sont refuses`() {
        assertThat(CanonicalBase64.decode("QR==")).isNull()
        assertThat(CanonicalBase64.decode("QUK=")).isNull()
    }

    @Test
    fun `un texte non base64 rend null sans lever`() {
        assertThat(CanonicalBase64.decode("é!?")).isNull()
        assertThat(CanonicalBase64.decode("QUJD=")).isNull()
    }
}
