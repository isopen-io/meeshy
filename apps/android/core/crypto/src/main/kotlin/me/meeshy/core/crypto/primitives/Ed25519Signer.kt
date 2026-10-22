package me.meeshy.core.crypto.primitives

import com.google.crypto.tink.subtle.Ed25519Sign
import com.google.crypto.tink.subtle.Ed25519Verify
import java.security.GeneralSecurityException

/** Signature Ed25519 (RFC 8032) à partir d'une graine de 32 octets, comme `Curve25519.Signing.PrivateKey`. */
public class Ed25519Signer private constructor(private val seed: ByteArray, public val publicKey: ByteArray) {

    public fun sign(message: ByteArray): ByteArray = try {
        Ed25519Sign(seed).sign(message)
    } catch (_: GeneralSecurityException) {
        throw CryptoException("Signature Ed25519 impossible")
    }

    public companion object {
        private const val SEED_LENGTH = 32

        public fun fromSeed(seed: ByteArray): Ed25519Signer {
            if (seed.size != SEED_LENGTH) throw CryptoException("Graine Ed25519 invalide")
            return try {
                Ed25519Signer(seed.copyOf(), Ed25519Sign.KeyPair.newKeyPairFromSeed(seed).publicKey)
            } catch (_: GeneralSecurityException) {
                throw CryptoException("Graine Ed25519 invalide")
            }
        }

        public fun generate(random: RandomSource = SecureRandomSource): Ed25519Signer =
            fromSeed(random.nextBytes(SEED_LENGTH))

        public fun verify(publicKey: ByteArray, message: ByteArray, signature: ByteArray): Boolean = try {
            Ed25519Verify(publicKey).verify(signature, message)
            true
        } catch (_: GeneralSecurityException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }
}
