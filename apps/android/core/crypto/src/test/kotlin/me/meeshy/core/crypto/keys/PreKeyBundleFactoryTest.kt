package me.meeshy.core.crypto.keys

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.core.crypto.primitives.Ed25519Signer
import me.meeshy.core.crypto.primitives.hex
import me.meeshy.core.crypto.primitives.toHex
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

class PreKeyBundleFactoryTest {
    private val alicePrivate = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
    private val alicePublic = "07a37cbc142093c8b755dc1b10e86cb426374ad16aa853ed0bdfc0b2b86d1c7c"
    private val bobPrivate = "65666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f8081828384"
    private val bobPublic = "5714769d116bf76436ae74bc793d2c30ad1903c59ac5273805c7e2698b410c36"
    private val rfcSeed = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb"
    private val rfcPublic = "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c"
    private val bobPublicSignature =
        "cf02380e448038e9d6a58b47fd161a3973daa31f5aee3622e47684c46efaec0a67e207943aecebf154de02418c3118ddfb9ed5af697dc9e9dcffaec2c855b900"

    private fun b64(hex: String) = CanonicalBase64.encode(hex.hex())

    private fun seededVault() = InMemorySecureStore().also {
        it.put("me.meeshy.e2ee.identityKey", b64(alicePrivate), "u1")
        it.put("me.meeshy.e2ee.signedPreKey", b64(bobPrivate), "u1")
        it.put("me.meeshy.e2ee.signingKey", b64(rfcSeed), "u1")
    }

    private fun factory(vault: InMemorySecureStore = seededVault()) =
        PreKeyBundleFactory(E2eeKeyStore(vault, "u1", ids = { 4242 }))

    @Test
    fun `le bundle porte les octets bruts des cles publiques comme CryptoKit`() {
        val bundle = factory().create()
        assertThat(bundle.identityKey).isEqualTo(b64(alicePublic))
        assertThat(bundle.signedPreKeyPublic).isEqualTo(b64(bobPublic))
        assertThat(CanonicalBase64.decode(bundle.identityKey)).hasLength(32)
        assertThat(CanonicalBase64.decode(bundle.signedPreKeyPublic)).hasLength(32)
    }

    @Test
    fun `la signature est l'Ed25519 de la signed prekey publique, octet identique au vecteur externe`() {
        val bundle = factory().create()
        val signature = CanonicalBase64.decode(bundle.signedPreKeySignature)!!
        assertThat(signature.toHex()).isEqualTo(bobPublicSignature)
        assertThat(Ed25519Signer.verify(rfcPublic.hex(), bobPublic.hex(), signature)).isTrue()
    }

    @Test
    fun `ids stables deviceId 1 et Kyber absent`() {
        val bundle = factory().create()
        assertThat(bundle.deviceId).isEqualTo(1)
        assertThat(bundle.registrationId).isEqualTo(4242)
        assertThat(bundle.signedPreKeyId).isEqualTo(4242)
        assertThat(bundle.preKeyId).isEqualTo(4242)
        assertThat(bundle.kyberPreKeyId).isNull()
        assertThat(bundle.kyberPreKeyPublic).isNull()
        assertThat(bundle.kyberPreKeySignature).isNull()
    }

    @Test
    fun `deux appels donnent le meme bundle`() {
        val factory = factory(InMemorySecureStore())
        assertThat(factory.create()).isEqualTo(factory.create())
    }

    @Test
    fun `la signature d'un bundle neuf se verifie avec la cle de signature publique`() {
        val factory = factory(InMemorySecureStore())
        val bundle = factory.create()
        assertThat(
            Ed25519Signer.verify(
                factory.signingPublicKey(),
                CanonicalBase64.decode(bundle.signedPreKeyPublic)!!,
                CanonicalBase64.decode(bundle.signedPreKeySignature)!!,
            ),
        ).isTrue()
    }
}
