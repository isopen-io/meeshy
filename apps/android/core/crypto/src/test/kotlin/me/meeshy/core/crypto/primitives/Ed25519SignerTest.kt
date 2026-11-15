package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class Ed25519SignerTest {
    private val seed = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60".hex()
    private val publicKey = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
    private val signature =
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"

    @Test
    fun `RFC 8032 test 1 cle publique et signature`() {
        val signer = Ed25519Signer.fromSeed(seed)
        assertThat(signer.publicKey.toHex()).isEqualTo(publicKey)
        assertThat(signer.sign(ByteArray(0)).toHex()).isEqualTo(signature)
    }

    @Test
    fun `la signature se verifie`() {
        assertThat(Ed25519Signer.verify(publicKey.hex(), ByteArray(0), signature.hex())).isTrue()
    }

    @Test
    fun `une signature alteree est refusee`() {
        val altered = signature.hex().also { it[0] = (it[0].toInt() xor 1).toByte() }
        assertThat(Ed25519Signer.verify(publicKey.hex(), ByteArray(0), altered)).isFalse()
    }

    @Test
    fun `un message different est refuse et une signature courte ne leve pas`() {
        assertThat(Ed25519Signer.verify(publicKey.hex(), byteArrayOf(1), signature.hex())).isFalse()
        assertThat(Ed25519Signer.verify(publicKey.hex(), ByteArray(0), ByteArray(3))).isFalse()
    }

    @Test
    fun `une cle generee signe et se verifie`() {
        val signer = Ed25519Signer.generate()
        val message = "bonjour".toByteArray()
        assertThat(Ed25519Signer.verify(signer.publicKey, message, signer.sign(message))).isTrue()
    }
}
