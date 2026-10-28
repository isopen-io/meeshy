package me.meeshy.sdk.media

/**
 * **Le retrait des étiquettes d'un MP3, SANS réencodage** (#13550, #13543).
 *
 * Un MP3 est une suite de trames MPEG que rien ne référence par position : les étiquettes se RETIRENT. Tombent l'ID3v2 de
 * tête (taille synchsafe, en-tête étendu et pied `3DI` compris, plusieurs à la suite), les octets nuls qui le suivent, puis,
 * après la dernière trame, l'APEv2 (avec ou sans en-tête), le Lyrics3 (v1 et v2), l'ID3v1 (`TAG`, 128 octets) et un ID3v2 de
 * fin. Les trames restent octet pour octet — l'en-tête Xing/Info/VBRI, qui vit dans la première, compris. Une trame tronquée
 * en toute fin est coupée. Tout le reste rend `null` : une étiquette qui déborde, aucune trame, un débit libre, des octets
 * inconnus entre ou après les trames — l'appelant refuse l'envoi.
 */
internal object Mp3MetadataScrubber {
    private val BITRATES_V1 = arrayOf(
        intArrayOf(0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448),
        intArrayOf(0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384),
        intArrayOf(0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320),
    )
    private val BITRATES_V2 = arrayOf(
        intArrayOf(0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256),
        intArrayOf(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
        intArrayOf(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
    )
    private val SAMPLE_RATES = mapOf(3 to intArrayOf(44100, 48000, 32000), 2 to intArrayOf(22050, 24000, 16000), 0 to intArrayOf(11025, 12000, 8000))

    /** Un MP3 : une étiquette ID3v2 en tête, ou deux trames MPEG valides qui se suivent dès le premier octet. */
    fun looksLikeMp3(src: ByteArray): Boolean =
        AudioTrailingTags.startsWithId3v2(src, 0) || frameLength(src, 0)?.let { frameLength(src, it) != null } == true

    /** Les trames seules — le MÊME tableau s'il n'y avait aucune étiquette — ou `null` si le fichier ne se lit pas. */
    fun scrub(src: ByteArray): ByteArray? {
        val start = leadingTagsEnd(src) ?: return null
        val (framesEnd, count) = walkFrames(src, start)
        if (count == 0) return null
        if (!onlyTrailingTags(src, framesEnd)) return null
        if (start == 0 && framesEnd == src.size) return src
        return src.copyOfRange(start, framesEnd)
    }

    private fun leadingTagsEnd(src: ByteArray): Int? {
        var at = 0
        while (AudioTrailingTags.startsWithId3v2(src, at)) at = AudioTrailingTags.id3v2End(src, at) ?: return null
        while (at < src.size && src[at].toInt() == 0) at++
        return at
    }

    private fun walkFrames(src: ByteArray, start: Int): Pair<Int, Int> {
        var at = start
        var count = 0
        while (true) {
            val length = frameLength(src, at) ?: return at to count
            if (at + length > src.size) return at to count
            at += length
            count++
        }
    }

    /** La longueur de la trame MPEG audio qui commence à [at], ou `null` si ce n'en est pas une (débit libre compris). */
    private fun frameLength(src: ByteArray, at: Int): Int? {
        if (at + 4 > src.size) return null
        val b1 = src[at + 1].toInt() and 0xFF
        val b2 = src[at + 2].toInt() and 0xFF
        if ((src[at].toInt() and 0xFF) != 0xFF || (b1 and 0xE0) != 0xE0) return null
        val version = (b1 shr 3) and 3
        val layer = (b1 shr 1) and 3
        val bitrateIndex = b2 shr 4
        val rateIndex = (b2 shr 2) and 3
        if (version == 1 || layer == 0 || bitrateIndex == 0 || bitrateIndex == 15 || rateIndex == 3) return null
        val layerIndex = 3 - layer
        val bitrate = (if (version == 3) BITRATES_V1 else BITRATES_V2)[layerIndex][bitrateIndex] * 1000
        val rate = SAMPLE_RATES.getValue(version)[rateIndex]
        val padding = (b2 shr 1) and 1
        return when {
            layer == 3 -> (12 * bitrate / rate + padding) * 4
            layer == 1 && version != 3 -> 72 * bitrate / rate + padding
            else -> 144 * bitrate / rate + padding
        }
    }

    /** Après la dernière trame : rien, une trame tronquée, ou une suite d'étiquettes connues qui couvre tout. */
    private fun onlyTrailingTags(src: ByteArray, from: Int): Boolean {
        var at = from
        while (at < src.size) {
            at = AudioTrailingTags.tagEnd(src, at) ?: return isTruncatedFinalFrame(src, at)
        }
        return true
    }

    private fun isTruncatedFinalFrame(src: ByteArray, at: Int): Boolean =
        frameLength(src, at)?.let { at + it > src.size } == true
}
