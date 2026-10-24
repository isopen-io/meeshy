package me.meeshy.core.crypto.primitives

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** HKDF-SHA256 (RFC 5869). Un sel vide vaut HashLen octets nuls, comme la spécification le prescrit. */
public object HkdfSha256 {
    private const val ALGORITHM = "HmacSHA256"
    private const val HASH_LENGTH = 32
    private const val MAX_LENGTH = 255 * HASH_LENGTH

    public fun derive(inputKeyMaterial: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        if (length !in 1..MAX_LENGTH) throw CryptoException("Longueur de dérivation invalide")
        val pseudoRandomKey = hmac(if (salt.isEmpty()) ByteArray(HASH_LENGTH) else salt, inputKeyMaterial)
        val output = ByteArray(length)
        var previous = ByteArray(0)
        var offset = 0
        var counter = 1
        while (offset < length) {
            previous = hmac(pseudoRandomKey, previous, info, byteArrayOf(counter.toByte()))
            val count = minOf(HASH_LENGTH, length - offset)
            previous.copyInto(output, offset, 0, count)
            offset += count
            counter++
        }
        return output
    }

    private fun hmac(key: ByteArray, vararg parts: ByteArray): ByteArray {
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(SecretKeySpec(key, ALGORITHM))
        parts.forEach(mac::update)
        return mac.doFinal()
    }
}
