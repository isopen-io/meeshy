package me.meeshy.sdk.model.brand

import kotlin.math.roundToInt

/**
 * Un PCM mono flottant `[-1, 1]` en WAV 16 bits : le conteneur sous lequel le moteur d'export lit les signatures sonores de la
 * marque (synthétisées, jamais des fichiers) comme n'importe quel son de la composition.
 */
object PcmWav {

    private const val HEADER_BYTES = 44
    private const val BYTES_PER_SAMPLE = 2
    private const val BITS_PER_SAMPLE = 16
    private const val PCM_FORMAT = 1

    fun encode(samples: FloatArray, sampleRate: Int): ByteArray {
        val dataBytes = samples.size * BYTES_PER_SAMPLE
        val out = ByteArray(HEADER_BYTES + dataBytes)
        var cursor = 0
        fun ascii(text: String) { text.forEach { out[cursor++] = it.code.toByte() } }
        fun int32(value: Int) { repeat(4) { out[cursor++] = (value ushr (8 * it)).toByte() } }
        fun int16(value: Int) { repeat(2) { out[cursor++] = (value ushr (8 * it)).toByte() } }
        ascii("RIFF"); int32(36 + dataBytes); ascii("WAVE")
        ascii("fmt "); int32(16); int16(PCM_FORMAT); int16(1); int32(sampleRate)
        int32(sampleRate * BYTES_PER_SAMPLE); int16(BYTES_PER_SAMPLE); int16(BITS_PER_SAMPLE)
        ascii("data"); int32(dataBytes)
        samples.forEach { int16((it.coerceIn(-1f, 1f) * Short.MAX_VALUE).roundToInt()) }
        return out
    }
}
