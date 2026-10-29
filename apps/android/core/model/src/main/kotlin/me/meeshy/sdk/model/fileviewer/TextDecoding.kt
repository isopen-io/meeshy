package me.meeshy.sdk.model.fileviewer

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

/**
 * L'encodage d'un texte reçu, deviné sans rien exécuter : une marque (UTF-8, UTF-16 LE/BE) fait foi ; sinon UTF-8
 * STRICT ; sinon Windows-1252 (le repli des éditeurs de texte et des exports Office/CSV d'avant l'UTF-8). Un octet
 * nul hors UTF-16 signale un binaire : le décodeur rend `null` et le fichier n'est jamais affiché comme du texte.
 */
internal object TextDecoding {

    private val windows1252: Charset = Charset.forName("windows-1252")
    private const val MAX_PARTIAL_UTF8_TAIL = 3

    fun decode(bytes: ByteArray, length: Int, truncated: Boolean): String? {
        bom(bytes, length)?.let { (charset, skip) ->
            return decodeLenient(bytes, skip, length, charset)
        }
        if ((0 until length).any { bytes[it] == 0.toByte() }) return null
        return decodeUtf8Strict(bytes, length, truncated)
            ?: decodeLenient(bytes, 0, length, windows1252)
    }

    private fun bom(bytes: ByteArray, length: Int): Pair<Charset, Int>? {
        fun at(i: Int) = bytes[i].toInt() and 0xFF
        return when {
            length >= 3 && at(0) == 0xEF && at(1) == 0xBB && at(2) == 0xBF -> Charsets.UTF_8 to 3
            length >= 2 && at(0) == 0xFF && at(1) == 0xFE -> Charsets.UTF_16LE to 2
            length >= 2 && at(0) == 0xFE && at(1) == 0xFF -> Charsets.UTF_16BE to 2
            else -> null
        }
    }

    /** UTF-8 sans tolérance ; une coupe au milieu d'un caractère (fichier tronqué) retire sa queue incomplète. */
    private fun decodeUtf8Strict(bytes: ByteArray, length: Int, truncated: Boolean): String? {
        val cuts = if (truncated) 0..MAX_PARTIAL_UTF8_TAIL else 0..0
        for (cut in cuts) {
            val end = length - cut
            if (end < 0) break
            try {
                return Charsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, 0, end))
                    .toString()
            } catch (_: CharacterCodingException) {
                continue
            }
        }
        return null
    }

    private fun decodeLenient(bytes: ByteArray, from: Int, to: Int, charset: Charset): String =
        charset.newDecoder()
            .onMalformedInput(CodingErrorAction.IGNORE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
            .decode(ByteBuffer.wrap(bytes, from, to - from))
            .toString()
}
