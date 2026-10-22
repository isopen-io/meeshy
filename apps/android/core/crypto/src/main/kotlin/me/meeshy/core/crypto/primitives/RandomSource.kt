package me.meeshy.core.crypto.primitives

import java.security.SecureRandom

/** Source d'octets aléatoires, injectable pour rendre le nonce déterministe en test. */
public fun interface RandomSource {
    public fun nextBytes(size: Int): ByteArray
}

public object SecureRandomSource : RandomSource {
    private val random = SecureRandom()

    override fun nextBytes(size: Int): ByteArray = ByteArray(size).also(random::nextBytes)
}
