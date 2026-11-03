package me.meeshy.core.crypto.session

import com.google.common.truth.Truth.assertThat
import java.util.Properties
import me.meeshy.core.crypto.keys.X25519KeyPair
import me.meeshy.core.crypto.primitives.X25519Agreement
import me.meeshy.core.crypto.primitives.hex
import me.meeshy.core.crypto.primitives.toHex
import org.junit.Assert.assertThrows
import org.junit.Test

/** Miroir de `packages/shared/fixtures/e2ee-session-derivation-vectors.json` (mêmes octets que la règle v2). */
class E2eeInteropVectorsTest {
    private val v = Properties().apply {
        checkNotNull(E2eeInteropVectorsTest::class.java.classLoader.getResourceAsStream("e2ee-session-derivation-vectors.properties")).use(::load)
    }

    private fun value(name: String) = checkNotNull(v.getProperty(name)).trim()

    private fun pair(privateName: String) = value(privateName).hex().let { X25519KeyPair(it, X25519Agreement.publicKey(it)) }

    private fun bundle(identityPublic: String, signedPublic: String) = PeerBundle(value(identityPublic).hex(), value(signedPublic).hex())

    private val a = value("userA")
    private val b = value("userB")

    @Test
    fun `les cles publiques des vecteurs sont celles des cles privees`() {
        assertThat(pair("identityPrivateA").publicKey.toHex()).isEqualTo(value("identityPublicA"))
        assertThat(pair("signedPreKeyPrivateB").publicKey.toHex()).isEqualTo(value("signedPreKeyPublicB"))
    }

    @Test
    fun `le plus petit userId derive la cle des vecteurs`() {
        val key = SessionKeyDerivation.derive(a, b, pair("identityPrivateA"), pair("signedPreKeyPrivateA"), bundle("identityPublicB", "signedPreKeyPublicB"))
        assertThat(key.toHex()).isEqualTo(value("derivedKey"))
    }

    @Test
    fun `le plus grand userId retrouve la meme cle des vecteurs`() {
        val key = SessionKeyDerivation.derive(b, a, pair("identityPrivateB"), pair("signedPreKeyPrivateB"), bundle("identityPublicA", "signedPreKeyPublicA"))
        assertThat(key.toHex()).isEqualTo(value("derivedKey"))
    }

    @Test
    fun `l'ancienne regle croisee donnait une autre cle`() {
        assertThat(value("legacyCrossedKey")).isNotEqualTo(value("derivedKey"))
    }

    @Test
    fun `une session avec soi-meme est refusee`() {
        assertThrows(me.meeshy.core.crypto.primitives.CryptoException::class.java) {
            SessionKeyDerivation.derive(a, a, pair("identityPrivateA"), pair("signedPreKeyPrivateA"), bundle("identityPublicB", "signedPreKeyPublicB"))
        }
    }
}
