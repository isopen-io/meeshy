package me.meeshy.core.crypto.primitives

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-256-GCM au format « combined » de CryptoKit : nonce (12) ‖ chiffré ‖ tag (16).
 * `open` rend `null` pour toute entrée altérée ou malformée, sans rien dire du contenu.
 */
public class AesGcmCombined(private val randomSource: RandomSource = SecureRandomSource) {

    public fun seal(key: ByteArray, plaintext: ByteArray, associatedData: ByteArray = ByteArray(0), nonce: ByteArray? = null): ByteArray {
        requireKey(key)
        val iv = nonce ?: randomSource.nextBytes(NONCE_LENGTH)
        if (iv.size != NONCE_LENGTH) throw CryptoException("Nonce invalide")
        val cipher = cipher(Cipher.ENCRYPT_MODE, key, iv, associatedData)
        return iv + cipher.doFinal(plaintext)
    }

    public fun open(key: ByteArray, combined: ByteArray, associatedData: ByteArray = ByteArray(0)): ByteArray? {
        if (key.size != KEY_LENGTH || combined.size < MIN_LENGTH) return null
        return try {
            val iv = combined.copyOfRange(0, NONCE_LENGTH)
            cipher(Cipher.DECRYPT_MODE, key, iv, associatedData)
                .doFinal(combined, NONCE_LENGTH, combined.size - NONCE_LENGTH)
        } catch (_: GeneralSecurityException) {
            null
        }
    }

    private fun cipher(mode: Int, key: ByteArray, iv: ByteArray, associatedData: ByteArray): Cipher =
        Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_LENGTH * 8, iv))
            if (associatedData.isNotEmpty()) updateAAD(associatedData)
        }

    private fun requireKey(key: ByteArray) {
        if (key.size != KEY_LENGTH) throw CryptoException("Clé symétrique invalide")
    }

    public companion object {
        public const val KEY_LENGTH: Int = 32
        public const val NONCE_LENGTH: Int = 12
        public const val TAG_LENGTH: Int = 16
        public const val MIN_LENGTH: Int = NONCE_LENGTH + TAG_LENGTH
    }
}
