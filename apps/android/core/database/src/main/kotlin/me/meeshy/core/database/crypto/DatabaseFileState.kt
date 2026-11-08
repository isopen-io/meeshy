package me.meeshy.core.database.crypto

import java.io.File

/**
 * Ce que l'en-tête du fichier `meeshy.db` dit de son contenu. [UNAVAILABLE] : le disque a refusé de le lire (E/S, droits) ;
 * il ne dit RIEN du fichier, qui n'est donc jamais purgé pour autant.
 */
public enum class DatabaseFileState { ABSENT, PLAINTEXT, ENCRYPTED, TRUNCATED, UNAVAILABLE }

public object DatabaseFileStates {
    private val PLAINTEXT_HEADER: ByteArray = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

    /** Une base SQLCipher fait au moins une page (512 octets minimum pour SQLite) : en dessous, le fichier est tronqué. */
    public const val MIN_ENCRYPTED_BYTES: Long = 512

    public fun classify(header: ByteArray, length: Long): DatabaseFileState = when {
        length <= 0L -> DatabaseFileState.ABSENT
        header.size >= PLAINTEXT_HEADER.size &&
            PLAINTEXT_HEADER.indices.all { header[it] == PLAINTEXT_HEADER[it] } -> DatabaseFileState.PLAINTEXT
        length < MIN_ENCRYPTED_BYTES -> DatabaseFileState.TRUNCATED
        else -> DatabaseFileState.ENCRYPTED
    }

    public fun of(file: File): DatabaseFileState {
        if (!file.exists()) return DatabaseFileState.ABSENT
        val header = try {
            file.inputStream().use { input -> ByteArray(PLAINTEXT_HEADER.size).also { buffer -> input.read(buffer) } }
        } catch (_: java.io.IOException) {
            return DatabaseFileState.UNAVAILABLE
        }
        return classify(header, file.length())
    }
}
