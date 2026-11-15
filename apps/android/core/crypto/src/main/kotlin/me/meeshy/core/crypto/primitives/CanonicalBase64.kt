package me.meeshy.core.crypto.primitives

import java.util.Base64

/**
 * Base64 strict : remplissage présent, bits de remplissage nuls, aucun blanc. Un texte n'est
 * accepté que si ré-encoder les octets décodés redonne exactement le texte reçu.
 * L'ouverture ne lève jamais : tout autre texte rend `null`.
 */
public object CanonicalBase64 {
    public fun encode(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

    public fun decode(text: String): ByteArray? {
        val bytes = try {
            Base64.getDecoder().decode(text)
        } catch (_: IllegalArgumentException) {
            return null
        }
        return bytes.takeIf { encode(it) == text }
    }
}
