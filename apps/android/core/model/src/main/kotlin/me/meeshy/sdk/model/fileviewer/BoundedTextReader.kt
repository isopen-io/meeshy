package me.meeshy.sdk.model.fileviewer

import java.io.InputStream

/**
 * La lecture BORNÉE d'un fichier reçu : jamais plus de [maxBytes] octets en mémoire, quelle que soit la taille
 * annoncée par l'expéditeur. L'encodage est détecté ([TextDecoding]) ; un contenu qui porte un octet nul sans marque
 * UTF-16 est binaire (jamais affiché comme du texte).
 */
object BoundedTextReader {

    /** Borne des visionneuses du fil : assez pour un fichier source, trop peu pour saturer un téléphone d'entrée de gamme. */
    const val DEFAULT_MAX_BYTES: Int = 512 * 1024

    data class Result(val text: String, val truncated: Boolean, val isBinary: Boolean)

    fun read(input: InputStream, maxBytes: Int = DEFAULT_MAX_BYTES): Result {
        val buffer = ByteArray(maxBytes + 1)
        var filled = 0
        while (filled < buffer.size) {
            val count = input.read(buffer, filled, buffer.size - filled)
            if (count < 0) break
            filled += count
        }
        val truncated = filled > maxBytes
        val used = minOf(filled, maxBytes)
        val text = TextDecoding.decode(buffer, used, truncated) ?: return Result("", truncated, isBinary = true)
        return Result(text, truncated, isBinary = false)
    }
}
