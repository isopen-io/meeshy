package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AesGcmCombinedTest {
    private val key = ByteArray(32)
    private val nonce = ByteArray(12)
    private fun sealer(random: RandomSource = RandomSource { ByteArray(it) { 7 } }) = AesGcmCombined(random)

    @Test
    fun `vecteur de reference GCM test case 13 et 14`() {
        val empty = sealer().seal(key, ByteArray(0), nonce = nonce)
        assertThat(empty.toHex()).isEqualTo("000000000000000000000000" + "530f8afbc74536b9a963b4f1c4cb738b")
        val block = sealer().seal(key, ByteArray(16), nonce = nonce)
        assertThat(block.toHex()).isEqualTo(
            "000000000000000000000000" + "cea7403d4d606b6e074ec5d3baf39d18" + "d0d1c8a799996bf0265b98b5d48ab919",
        )
    }

    @Test
    fun `forme nonce chiffre tag et aller retour`() {
        val sealed = sealer().seal(key, "salut".toByteArray(), "aad".toByteArray())
        assertThat(sealed.size).isEqualTo(12 + 5 + 16)
        assertThat(sealed.copyOfRange(0, 12)).isEqualTo(ByteArray(12) { 7 })
        assertThat(sealer().open(key, sealed, "aad".toByteArray())).isEqualTo("salut".toByteArray())
    }

    @Test
    fun `le nonce injecte est celui du resultat`() {
        val fixed = ByteArray(12) { 9 }
        assertThat(sealer().seal(key, byteArrayOf(1), nonce = fixed).copyOfRange(0, 12)).isEqualTo(fixed)
    }

    @Test
    fun `tout octet altere est refuse`() {
        val sealed = sealer().seal(key, "salut".toByteArray())
        sealed.indices.forEach { index ->
            val altered = sealed.copyOf().also { it[index] = (it[index].toInt() xor 1).toByte() }
            assertThat(sealer().open(key, altered)).isNull()
        }
    }

    @Test
    fun `donnees associees differentes cle fausse ou entree trop courte rendent null`() {
        val sealed = sealer().seal(key, "salut".toByteArray(), "a".toByteArray())
        assertThat(sealer().open(key, sealed, "b".toByteArray())).isNull()
        assertThat(sealer().open(ByteArray(32) { 1 }, sealed, "a".toByteArray())).isNull()
        assertThat(sealer().open(key, ByteArray(27))).isNull()
        assertThat(sealer().open(ByteArray(5), sealed)).isNull()
    }

    @Test
    fun `une cle invalide leve sans reveler la cle`() {
        val error = runCatching { sealer().seal(ByteArray(5) { 42 }, byteArrayOf(1)) }.exceptionOrNull()
        assertThat(error).isInstanceOf(CryptoException::class.java)
        assertThat(error!!.message).doesNotContain("42")
    }
}
