package me.meeshy.core.crypto.keys

import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.core.crypto.primitives.RandomSource
import me.meeshy.core.crypto.primitives.SecureRandomSource

/** Source d'identifiants stables (registrationId, preKeyId, signedPreKeyId) dans 1..65535, comme `Int.random(in: 1...65535)` d'iOS. */
public fun interface StableIdSource {
    public fun nextId(): Int
}

public class RandomStableIdSource(private val random: RandomSource = SecureRandomSource) : StableIdSource {
    override fun nextId(): Int {
        val bytes = random.nextBytes(2)
        val raw = ((bytes[0].toInt() and 0xFF) shl 8) or (bytes[1].toInt() and 0xFF)
        return raw % MAX_ID + 1
    }

    public companion object {
        public const val MAX_ID: Int = 65535
    }
}

/** Int32 petit-boutiste en base64, octet pour octet l'`Int32` natif que le trousseau iOS persiste. */
internal object StableIdCodec {
    private const val WIDTH = 4

    fun encode(id: Int): String =
        CanonicalBase64.encode(ByteArray(WIDTH) { index -> (id ushr (8 * index)).toByte() })

    fun decode(text: String): Int? {
        val bytes = CanonicalBase64.decode(text)?.takeIf { it.size >= WIDTH } ?: return null
        val value = (0 until WIDTH).fold(0) { acc, index -> acc or ((bytes[index].toInt() and 0xFF) shl (8 * index)) }
        return value.takeIf { it in 1..RandomStableIdSource.MAX_ID }
    }
}
