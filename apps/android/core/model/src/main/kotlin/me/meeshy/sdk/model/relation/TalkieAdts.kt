package me.meeshy.sdk.model.relation

/** Le format d'un flux AAC ADTS, lu sur l'en-tête de sa première trame. */
public data class AdtsFormat(val audioObjectType: Int, val sampleRateIndex: Int, val channels: Int) {
    /** La fréquence d'échantillonnage, `null` pour un index réservé. */
    val sampleRate: Int? get() = SAMPLE_RATES.getOrNull(sampleRateIndex)

    /** L'AudioSpecificConfig (`csd-0`) qu'un décodeur AAC attend : deux octets dérivés de l'en-tête. */
    val audioSpecificConfig: ByteArray
        get() = byteArrayOf(
            ((audioObjectType shl 3) or (sampleRateIndex shr 1)).toByte(),
            (((sampleRateIndex and 1) shl 7) or (channels shl 3)).toByte(),
        )

    private companion object {
        val SAMPLE_RATES = listOf(96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350)
    }
}

/** Une trame ADTS : son format, et sa charge AAC brute (en-tête retiré). */
public class AdtsFrame(public val format: AdtsFormat, public val payload: ByteArray)

/**
 * Le découpage d'un fragment de talkie en trames AAC (#16675). Chaque fragment est autonome — ses trames portent leur
 * en-tête — : il se lit seul, dès son arrivée. Une trame tronquée ou un octet hors synchronisation arrête la lecture du
 * fragment là où elle devient illisible, sans rien inventer.
 */
public object TalkieAdts {
    private const val HEADER_BYTES = 7
    private const val CRC_BYTES = 2

    public fun frames(bytes: ByteArray): List<AdtsFrame> = generateSequence(0 to frameAt(bytes, 0)) { (offset, frame) ->
        frame?.let { (_, length) -> (offset + length).let { next -> next to frameAt(bytes, next) } }
    }.mapNotNull { (_, frame) -> frame?.first }.toList()

    private fun frameAt(bytes: ByteArray, offset: Int): Pair<AdtsFrame, Int>? {
        if (offset + HEADER_BYTES > bytes.size) return null
        val b = { index: Int -> bytes[offset + index].toInt() and 0xFF }
        if (b(0) != 0xFF || (b(1) and 0xF0) != 0xF0) return null
        val headerLength = if ((b(1) and 0x01) == 1) HEADER_BYTES else HEADER_BYTES + CRC_BYTES
        val frameLength = ((b(3) and 0x03) shl 11) or (b(4) shl 3) or ((b(5) and 0xE0) shr 5)
        if (frameLength <= headerLength || offset + frameLength > bytes.size) return null
        val format = AdtsFormat(
            audioObjectType = ((b(2) shr 6) and 0x03) + 1,
            sampleRateIndex = (b(2) shr 2) and 0x0F,
            channels = ((b(2) and 0x01) shl 2) or ((b(3) shr 6) and 0x03),
        )
        return AdtsFrame(format, bytes.copyOfRange(offset + headerLength, offset + frameLength)) to frameLength
    }
}
