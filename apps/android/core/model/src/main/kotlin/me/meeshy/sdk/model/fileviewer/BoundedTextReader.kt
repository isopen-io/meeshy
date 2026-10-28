package me.meeshy.sdk.model.fileviewer

import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/**
 * La lecture BORNÉE d'un fichier reçu : jamais plus de [maxBytes] octets en mémoire, quelle que soit la taille
 * annoncée par l'expéditeur. Un contenu qui porte un octet nul est binaire (jamais affiché comme du texte).
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
        if ((0 until used).any { buffer[it] == 0.toByte() }) return Result("", truncated, isBinary = true)
        // Une coupe au milieu d'un caractère multi-octets : on s'arrête avant, sans caractère de remplacement.
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(if (truncated) CodingErrorAction.IGNORE else CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
        val text = decoder.decode(ByteBuffer.wrap(buffer, 0, used)).toString()
        return Result(text, truncated, isBinary = false)
    }
}
