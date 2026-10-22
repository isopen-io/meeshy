package me.meeshy.sdk.model.translation

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * HKDF-SHA256 (RFC 5869), extract puis expand. Pur JVM (`javax.crypto`), aucune
 * dépendance Android : la dérivation de la clé d'une traduction partagée est la
 * même, octet pour octet, que celle de WebCrypto (TypeScript) et de CryptoKit.
 */
internal object Hkdf {
    private const val MAC = "HmacSHA256"
    private const val HASH_LENGTH = 32

    fun deriveKey(
        inputKeyMaterial: ByteArray,
        salt: ByteArray,
        info: ByteArray,
        outputByteCount: Int,
    ): ByteArray {
        require(outputByteCount in 1..(255 * HASH_LENGTH)) { "longueur de sortie HKDF hors bornes" }
        val pseudoRandomKey = hmac(key = if (salt.isEmpty()) ByteArray(HASH_LENGTH) else salt, data = inputKeyMaterial)
        val blocks = (outputByteCount + HASH_LENGTH - 1) / HASH_LENGTH
        val output = ByteArray(blocks * HASH_LENGTH)
        var previous = ByteArray(0)
        for (index in 1..blocks) {
            previous = hmac(key = pseudoRandomKey, data = previous + info + byteArrayOf(index.toByte()))
            previous.copyInto(output, (index - 1) * HASH_LENGTH)
        }
        return output.copyOf(outputByteCount)
    }

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray =
        Mac.getInstance(MAC).apply { init(SecretKeySpec(key, MAC)) }.doFinal(data)
}
