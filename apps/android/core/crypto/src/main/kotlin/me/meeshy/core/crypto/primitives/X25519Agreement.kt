package me.meeshy.core.crypto.primitives

import com.google.crypto.tink.subtle.X25519
import java.security.GeneralSecurityException

/** Accord de clé X25519 (RFC 7748) et dérivation de la clé de message de l'E2EE Meeshy. */
public object X25519Agreement {
    private const val KEY_LENGTH = 32
    private val SHARED_INFO = "MeeshyE2EE".toByteArray(Charsets.UTF_8)

    public fun generatePrivateKey(): ByteArray = X25519.generatePrivateKey()

    public fun publicKey(privateKey: ByteArray): ByteArray {
        requireLength(privateKey)
        return try {
            X25519.publicFromPrivate(privateKey)
        } catch (_: GeneralSecurityException) {
            throw CryptoException("Clé privée X25519 invalide")
        }
    }

    public fun sharedSecret(privateKey: ByteArray, peerPublicKey: ByteArray): ByteArray {
        requireLength(privateKey)
        requireLength(peerPublicKey)
        return try {
            X25519.computeSharedSecret(privateKey, peerPublicKey)
        } catch (_: GeneralSecurityException) {
            throw CryptoException("Accord X25519 refusé")
        }
    }

    /** Parité CryptoKit `hkdfDerivedSymmetricKey(SHA256, salt: Data(), sharedInfo: "MeeshyE2EE", 32)`. */
    public fun deriveSymmetricKey(privateKey: ByteArray, peerPublicKey: ByteArray): ByteArray =
        HkdfSha256.derive(sharedSecret(privateKey, peerPublicKey), ByteArray(0), SHARED_INFO, KEY_LENGTH)

    private fun requireLength(key: ByteArray) {
        if (key.size != KEY_LENGTH) throw CryptoException("Longueur de clé X25519 invalide")
    }
}
