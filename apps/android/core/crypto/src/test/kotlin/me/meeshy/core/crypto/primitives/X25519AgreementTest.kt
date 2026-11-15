package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class X25519AgreementTest {
    private val alicePrivate = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a".hex()
    private val alicePublic = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a"
    private val bobPrivate = "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb".hex()
    private val bobPublic = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f"
    private val shared = "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742"

    @Test
    fun `RFC 7748 6_1 cles publiques`() {
        assertThat(X25519Agreement.publicKey(alicePrivate).toHex()).isEqualTo(alicePublic)
        assertThat(X25519Agreement.publicKey(bobPrivate).toHex()).isEqualTo(bobPublic)
    }

    @Test
    fun `RFC 7748 6_1 secret partage symetrique`() {
        assertThat(X25519Agreement.sharedSecret(alicePrivate, bobPublic.hex()).toHex()).isEqualTo(shared)
        assertThat(X25519Agreement.sharedSecret(bobPrivate, alicePublic.hex()).toHex()).isEqualTo(shared)
    }

    @Test
    fun `un point d ordre faible est refuse`() {
        val error = runCatching { X25519Agreement.sharedSecret(alicePrivate, ByteArray(32)) }.exceptionOrNull()
        assertThat(error).isInstanceOf(CryptoException::class.java)
    }

    @Test
    fun `une cle de mauvaise longueur est refusee`() {
        val error = runCatching { X25519Agreement.sharedSecret(ByteArray(31), ByteArray(32)) }.exceptionOrNull()
        assertThat(error).isInstanceOf(CryptoException::class.java)
    }
}
