package me.meeshy.core.crypto.primitives

import com.google.common.truth.Truth.assertThat
import java.util.Properties
import org.junit.Test

class IosInteropVectorsTest {
    private val vectors = Properties().apply {
        checkNotNull(javaClass.classLoader.getResourceAsStream("ios-interop-vectors.properties")).use(::load)
    }

    private fun vector(name: String) = checkNotNull(vectors.getProperty(name)).trim()

    @Test
    fun `les cles publiques sont celles de CryptoKit`() {
        assertThat(X25519Agreement.publicKey(vector("alicePrivate").hex()).toHex()).isEqualTo(vector("alicePublic"))
        assertThat(X25519Agreement.publicKey(vector("bobPrivate").hex()).toHex()).isEqualTo(vector("bobPublic"))
    }

    @Test
    fun `X25519 puis HKDF sel vide info MeeshyE2EE donne les octets de CryptoKit`() {
        val sharedSecret = X25519Agreement.sharedSecret(vector("alicePrivate").hex(), vector("bobPublic").hex())
        assertThat(sharedSecret.toHex()).isEqualTo(vector("sharedSecret"))
        val derived = X25519Agreement.deriveSymmetricKey(vector("alicePrivate").hex(), vector("bobPublic").hex())
        assertThat(derived.toHex()).isEqualTo(vector("derivedKey"))
        val reverse = X25519Agreement.deriveSymmetricKey(vector("bobPrivate").hex(), vector("alicePublic").hex())
        assertThat(reverse.toHex()).isEqualTo(vector("derivedKey"))
    }
}
