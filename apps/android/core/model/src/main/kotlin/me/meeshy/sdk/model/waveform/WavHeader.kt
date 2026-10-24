package me.meeshy.sdk.model.waveform

/**
 * L'en-tête d'un fichier WAV PCM : de quoi lire ses échantillons sans codec. Un `.wav` (export du
 * composer, son importé) n'a pas besoin de `MediaCodec` — on le lit tel quel, ce qui est plus
 * rapide qu'un décodeur à démarrer et reste exact. Tout autre conteneur ou codage (compressé,
 * 24 bits…) rend `null` : l'extracteur retombe alors sur `MediaExtractor` + `MediaCodec`.
 */
data class WavHeader(
    val channelCount: Int,
    val sampleRate: Int,
    val encoding: PcmEncoding,
    val dataOffset: Int,
    val dataBytes: Long,
) {
    val frameBytes: Int get() = channelCount * encoding.bytesPerSample

    val totalFrames: Long get() = dataBytes / frameBytes

    companion object {
        private const val RIFF_HEADER_BYTES = 12
        private const val CHUNK_HEADER_BYTES = 8
        private const val FORMAT_PCM = 1
        private const val FORMAT_FLOAT = 3
        private const val FORMAT_EXTENSIBLE = 0xFFFE
        private const val EXTENSIBLE_SUBFORMAT_OFFSET = 24
        private const val FORMAT_BODY_MIN_BYTES = 16

        /**
         * Lit l'en-tête dans [head] (le début du fichier, long de `min(longueur, 64 Kio)`). Une
         * taille de données nulle ou trop grande (WAV écrit en flux) s'étend jusqu'à la fin du
         * fichier de [fileLength] octets.
         */
        fun parse(head: ByteArray, fileLength: Long): WavHeader? {
            if (head.size < RIFF_HEADER_BYTES || !head.hasTag(0, "RIFF") || !head.hasTag(8, "WAVE")) return null
            var format: Format? = null
            var position = RIFF_HEADER_BYTES
            while (position + CHUNK_HEADER_BYTES <= head.size) {
                val size = head.u32(position + 4)
                val body = position + CHUNK_HEADER_BYTES
                when {
                    head.hasTag(position, "fmt ") -> format = parseFormat(head, body, size) ?: return null
                    head.hasTag(position, "data") -> return format?.let { dataHeader(it, body, size, fileLength) }
                }
                val next = body.toLong() + size + (size and 1L)
                if (next > head.size) return null
                position = next.toInt()
            }
            return null
        }

        private fun dataHeader(format: Format, offset: Int, declared: Long, fileLength: Long): WavHeader? {
            val remaining = fileLength - offset
            if (remaining <= 0) return null
            val bytes = if (declared == 0L || declared > remaining) remaining else declared
            return WavHeader(format.channels, format.sampleRate, format.encoding, offset, bytes)
                .takeIf { it.totalFrames > 0 }
        }

        private fun parseFormat(head: ByteArray, body: Int, size: Long): Format? {
            if (size < FORMAT_BODY_MIN_BYTES || body + FORMAT_BODY_MIN_BYTES > head.size) return null
            val tag = head.u16(body)
            val channels = head.u16(body + 2)
            val sampleRate = head.u32(body + 4).toInt()
            val bits = head.u16(body + 14)
            val code = if (tag == FORMAT_EXTENSIBLE) extensibleCode(head, body, size) ?: return null else tag
            val encoding = when {
                code == FORMAT_PCM && bits == 16 -> PcmEncoding.PCM_16BIT
                code == FORMAT_FLOAT && bits == 32 -> PcmEncoding.PCM_FLOAT
                else -> return null
            }
            if (channels < 1 || sampleRate < 1) return null
            return Format(channels, sampleRate, encoding)
        }

        private fun extensibleCode(head: ByteArray, body: Int, size: Long): Int? {
            if (size < EXTENSIBLE_SUBFORMAT_OFFSET + 2 || body + EXTENSIBLE_SUBFORMAT_OFFSET + 2 > head.size) return null
            return head.u16(body + EXTENSIBLE_SUBFORMAT_OFFSET)
        }

        private class Format(val channels: Int, val sampleRate: Int, val encoding: PcmEncoding)

        private fun ByteArray.hasTag(offset: Int, tag: String): Boolean =
            offset + tag.length <= size && tag.indices.all { this[offset + it].toInt() == tag[it].code }

        private fun ByteArray.u16(offset: Int): Int = (this[offset].toInt() and 0xFF) or ((this[offset + 1].toInt() and 0xFF) shl 8)

        private fun ByteArray.u32(offset: Int): Long = u16(offset).toLong() or (u16(offset + 2).toLong() shl 16)
    }
}
