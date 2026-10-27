package me.meeshy.sdk.media

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * **Le retrait du lieu d'une photo, SANS la ré-encoder** (#13450 ; miroir de `OutgoingImageLocation` d'iOS #12905).
 *
 * Les pixels ne bougent pas : on réécrit les conteneurs. JPEG — EXIF reconstruit depuis une liste blanche
 * ([ExifPrivacyRewriter]), XMP, IPTC, commentaires, vignettes MPF et octets après la fin d'image retirés. PNG —
 * `eXIf` et blocs texte (dont l'XMP) retirés. WebP — `EXIF` et `XMP ` retirés, drapeaux du `VP8X` baissés.
 * Chaque méthode rend `null` quand le conteneur est illisible : l'appelant ne laisse alors RIEN partir tel quel.
 */
internal object ImageMetadataScrubber {
    private const val FF = 0xFF
    private val EXIF_HEADER = "Exif\u0000\u0000".toByteArray(Charsets.ISO_8859_1)
    private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    private val PNG_KEPT = setOf(
        "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD", "acTL", "fcTL", "fdAT",
    )
    private val WEBP_KEPT = setOf("VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP")
    private const val WEBP_VP8X_METADATA_FLAGS = 0x0C
    private val GIF_KEPT_APPLICATIONS = setOf("NETSCAPE2.0", "ANIMEXTS1.0")

    fun jpeg(src: ByteArray): ByteArray? = runCatching { scrubJpeg(src) }.getOrNull()

    fun png(src: ByteArray): ByteArray? = runCatching { scrubPng(src) }.getOrNull()

    fun webp(src: ByteArray): ByteArray? = runCatching { scrubWebp(src) }.getOrNull()

    fun gif(src: ByteArray): ByteArray? = runCatching { scrubGif(src) }.getOrNull()

    /** Les octets sortis ne contiennent QUE des blocs autorisés : les repasser par le retrait ne change rien. */
    fun isStable(scrubbed: ByteArray, scrub: (ByteArray) -> ByteArray?): Boolean = scrub(scrubbed)?.contentEquals(scrubbed) == true

    /** Vrai quand ces octets JPEG portent encore autre chose que la liste blanche : XMP, IPTC, lieu, vignette. */
    fun jpegCarriesMetadata(src: ByteArray): Boolean = runCatching {
        var carries = false
        walkJpeg(src) { marker, payload, _ ->
            carries = carries || when {
                marker == 0xE1 && payload.startsWith(EXIF_HEADER) -> !ExifPrivacyRewriter.isClean(payload.copyOfRange(EXIF_HEADER.size, payload.size))
                marker == 0xE1 || marker == 0xED || marker == 0xFE -> true
                else -> false
            }
        }
        carries
    }.getOrDefault(true)

    private fun ByteArray.startsWith(prefix: ByteArray) = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

    private fun u16(src: ByteArray, at: Int) = (src[at].toInt() and 0xFF shl 8) or (src[at + 1].toInt() and 0xFF)

    private fun scrubJpeg(src: ByteArray): ByteArray? {
        val out = ByteArrayOutputStream(src.size)
        out.write(FF)
        out.write(0xD8)
        val finished = walkJpeg(src) { marker, payload, raw ->
            when {
                marker == 0xE1 && payload.startsWith(EXIF_HEADER) ->
                    ExifPrivacyRewriter.rewrite(payload.copyOfRange(EXIF_HEADER.size, payload.size))?.let { tiff ->
                        val body = EXIF_HEADER + tiff
                        out.write(FF); out.write(0xE1)
                        out.write((body.size + 2) shr 8); out.write((body.size + 2) and 0xFF)
                        out.write(body)
                    }
                keepsSegment(marker, payload) -> out.write(raw)
            }
        }
        if (!finished) return null
        out.write(FF)
        out.write(0xD9)
        return out.toByteArray()
    }

    private fun keepsSegment(marker: Int, payload: ByteArray): Boolean = when (marker) {
        0xE1, 0xED, 0xFE, 0xEF -> false
        in 0xE3..0xEC -> false
        0xE2 -> !payload.startsWith("MPF\u0000".toByteArray(Charsets.ISO_8859_1))
        else -> true
    }

    /**
     * Parcourt les segments jusqu'au PREMIER EOI ; [visit] reçoit le marqueur, la charge utile et le segment brut
     * (les données entropiques d'un SOS sont recopiées avec lui). `false` quand le fichier n'est pas un JPEG complet.
     */
    private fun walkJpeg(src: ByteArray, visit: (Int, ByteArray, ByteArray) -> Unit): Boolean {
        if (src.size < 4 || u16(src, 0) != 0xFFD8) return false
        var p = 2
        while (p + 1 < src.size) {
            if (src[p].toInt() and 0xFF != FF) return false
            val marker = src[p + 1].toInt() and 0xFF
            when {
                marker == FF -> p++
                marker == 0xD9 -> return true
                marker == 0x01 || marker in 0xD0..0xD7 -> {
                    visit(marker, ByteArray(0), src.copyOfRange(p, p + 2))
                    p += 2
                }
                else -> {
                    val length = u16(src, p + 2)
                    if (length < 2 || p + 2 + length > src.size) return false
                    var end = p + 2 + length
                    if (marker == 0xDA) end = entropyEnd(src, end)
                    val headerEnd = p + 2 + length
                    visit(marker, src.copyOfRange(p + 4, headerEnd), src.copyOfRange(p, end))
                    p = end
                }
            }
        }
        return false
    }

    private fun entropyEnd(src: ByteArray, from: Int): Int {
        var q = from
        while (q + 1 < src.size) {
            val next = src[q + 1].toInt() and 0xFF
            if (src[q].toInt() and 0xFF == FF && next != 0 && next != FF && next !in 0xD0..0xD7) return q
            q++
        }
        return src.size
    }

    private fun scrubPng(src: ByteArray): ByteArray? {
        if (!src.startsWith(PNG_SIGNATURE)) return null
        val out = ByteArrayOutputStream(src.size)
        out.write(PNG_SIGNATURE)
        var p = PNG_SIGNATURE.size
        while (p + 12 <= src.size) {
            val length = ByteBuffer.wrap(src, p, 4).order(ByteOrder.BIG_ENDIAN).int
            val end = p + 12L + length
            if (length < 0 || end > src.size) return null
            val type = String(src, p + 4, 4, Charsets.ISO_8859_1)
            if (type in PNG_KEPT) out.write(src, p, end.toInt() - p)
            p = end.toInt()
            if (type == "IEND") return out.toByteArray()
        }
        return null
    }

    private fun scrubWebp(src: ByteArray): ByteArray? {
        if (src.size < 12) return null
        val body = ByteArrayOutputStream(src.size)
        var p = 12
        while (p + 8 <= src.size) {
            val length = ByteBuffer.wrap(src, p + 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
            val padded = length.toLong() + (length and 1)
            val end = p + 8L + padded
            if (length < 0 || end > src.size) return null
            val chunk = src.copyOfRange(p, end.toInt())
            val fourcc = String(chunk, 0, 4, Charsets.ISO_8859_1)
            if (fourcc == "VP8X" && chunk.size > 8) chunk[8] = (chunk[8].toInt() and WEBP_VP8X_METADATA_FLAGS.inv()).toByte()
            if (fourcc in WEBP_KEPT) body.write(chunk)
            p = end.toInt()
        }
        if (p != src.size) return null
        val out = ByteBuffer.allocate(12 + body.size()).order(ByteOrder.LITTLE_ENDIAN)
        out.put(src, 0, 4).putInt(4 + body.size()).put(src, 8, 4).put(body.toByteArray())
        return out.array()
    }

    /**
     * GIF : on ne garde que ce qui fait l'image et son animation — table de couleurs, contrôle graphique, images,
     * boucle `NETSCAPE2.0`. Commentaires, texte simple et toute autre extension d'application (XMP) tombent.
     */
    private fun scrubGif(src: ByteArray): ByteArray? {
        if (src.size < 13 || String(src, 0, 3, Charsets.ISO_8859_1) != "GIF") return null
        val out = ByteArrayOutputStream(src.size)
        var p = 13 + colorTableSize(src[10].toInt())
        if (p > src.size) return null
        out.write(src, 0, p)
        while (p < src.size) {
            when (src[p].toInt() and 0xFF) {
                0x3B -> { out.write(0x3B); return out.toByteArray() }
                0x21 -> {
                    val end = skipSubBlocks(src, p + 2)
                    val label = src[p + 1].toInt() and 0xFF
                    val application = label == 0xFF && src[p + 2].toInt() == 11 &&
                        String(src, p + 3, 11, Charsets.ISO_8859_1) in GIF_KEPT_APPLICATIONS
                    if (label == 0xF9 || application) out.write(src, p, end - p)
                    p = end
                }
                0x2C -> {
                    val tableEnd = p + 10 + colorTableSize(src[p + 9].toInt())
                    val end = skipSubBlocks(src, tableEnd + 1)
                    out.write(src, p, end - p)
                    p = end
                }
                else -> return null
            }
        }
        return null
    }

    private fun colorTableSize(flags: Int) = if (flags and 0x80 != 0) 3 shl ((flags and 7) + 1) else 0

    private fun skipSubBlocks(src: ByteArray, from: Int): Int {
        var q = from
        while (true) {
            val size = src[q].toInt() and 0xFF
            q += 1 + size
            if (size == 0) return q
        }
    }
}
