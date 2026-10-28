package me.meeshy.sdk.media

import java.nio.ByteBuffer

/**
 * **Le retrait du lieu d'une vidéo ou d'un son MP4 / MOV / 3GP / M4A, SANS réencodage ni déplacement d'octet** (#13543, #13490).
 *
 * Une boîte retirée n'est pas supprimée : elle devient une boîte `free` de MÊME taille, contenu mis à zéro. Aucun
 * décalage ne bouge donc — les `stco`/`co64` restent justes, `moov` reste devant `mdat` si c'était le cas (lecture
 * progressive), les pistes, leurs horloges et la matrice de rotation du `tkhd` ne changent pas d'un octet.
 *
 * Liste BLANCHE à chaque niveau parcouru (`moov`, `trak`, `mdia`, `minf`, `edts`, `mvex`) : tout le reste tombe —
 * `udta` (`©xyz` qu'écrit `MediaMuxer.setLocation`, `loci` 3GPP, XMP), `meta` (`keys`/`ilst` d'Apple dont
 * `com.apple.quicktime.location.ISO6709`), `uuid` (XMP), aperçus `pnot`/`PICT`. Les remplissages (`free`, `skip`, `wide`)
 * sont vidés : un logiciel de montage y laisse d'anciens `moov`. Une piste qui n'est ni image, ni son, ni sous-titre, ni
 * code temporel (métadonnées minutées : `mebx` de l'iPhone, `camm`, `gpmd`, qui portent un lieu PAR IMAGE) disparaît et
 * ses échantillons sont mis à zéro dans `mdat`. Des octets illisibles APRÈS le film complet (traîne de fabricant) sont
 * coupés. Tout le reste d'illisible — `moov` compressé (`cmov`), tailles incohérentes, piste minutée fragmentée — rend
 * `null` : l'appelant refuse l'envoi plutôt que de laisser partir l'original.
 */
internal object IsoMediaMetadataScrubber {
    private const val HEADER = 8
    private const val FREE = "free"
    private val PADDING = setOf("free", "skip", "wide")
    private val TOP_LEVEL_KEPT = setOf("ftyp", "moov", "mdat", "moof", "mfra", "sidx", "ssix", "styp", "pdin", "emsg", "prft") + PADDING
    private val KEPT = mapOf(
        "moov" to setOf("mvhd", "trak", "mvex", "iods"),
        "trak" to setOf("tkhd", "edts", "mdia", "tref", "tapt", "trgr", "load", "txas"),
        "mdia" to setOf("mdhd", "hdlr", "minf", "elng"),
        "minf" to setOf("vmhd", "smhd", "hmhd", "nmhd", "sthd", "gmhd", "hdlr", "dinf", "stbl"),
        "edts" to setOf("elst"),
        "mvex" to setOf("mehd", "trex", "trep", "leva"),
    )
    private val MEDIA_HANDLERS = setOf("vide", "soun", "text", "sbtl", "subt", "clcp", "tmcd", "auxv", "pict")

    private class Box(val type: String, val offset: Int, val header: Int, val end: Int) {
        val payload: Int get() = offset + header
    }

    private sealed interface Edit {
        class Neutralize(val box: Box) : Edit
        class Zero(val from: Int, val to: Int) : Edit
    }

    private class Plan(val edits: List<Edit>, val length: Int)

    private class Unreadable : Exception()

    /** Vrai quand ces octets commencent comme un fichier ISO sans `ftyp` (ancien QuickTime) : une boîte connue, de taille plausible. */
    fun looksLikeIsoMedia(src: ByteArray): Boolean = runCatching {
        val first = readBox(src, 0, src.size)
        first.type in setOf("moov", "mdat", "wide", "free", "skip", "pnot") && first.end <= src.size
    }.getOrDefault(false)

    /** Les octets sans lieu ni métadonnée — le MÊME tableau quand il n'y avait rien à retirer — ou `null` s'ils sont illisibles. */
    fun scrub(src: ByteArray): ByteArray? {
        val plan = runCatching { plan(src) }.getOrNull() ?: return null
        val edits = plan.edits.filter { it.changes(src) }
        if (edits.isEmpty() && plan.length == src.size) return src
        val out = src.copyOf(plan.length)
        edits.forEach { it.applyTo(out) }
        return out
    }

    private fun Edit.changes(src: ByteArray): Boolean = when (this) {
        is Edit.Neutralize -> String(src, box.offset + 4, 4, Charsets.ISO_8859_1) != FREE || !zero(src, box.payload, box.end)
        is Edit.Zero -> !zero(src, from, to)
    }

    private fun Edit.applyTo(out: ByteArray) {
        when (this) {
            is Edit.Neutralize -> {
                FREE.toByteArray(Charsets.ISO_8859_1).copyInto(out, box.offset + 4)
                out.fill(0, box.payload, box.end)
            }
            is Edit.Zero -> out.fill(0, from, to)
        }
    }

    private fun zero(src: ByteArray, from: Int, to: Int): Boolean = (from until to).all { src[it].toInt() == 0 }

    private fun plan(src: ByteArray): Plan {
        val edits = mutableListOf<Edit>()
        var at = 0
        var seenMoov = false
        var mediaEnd = -1
        while (at < src.size) {
            val box = runCatching { readBox(src, at, src.size) }.getOrNull()
            if (box == null) {
                if (!seenMoov || mediaEnd < 0) throw Unreadable()
                return Plan(edits, at)
            }
            when (box.type) {
                "moov" -> { edits += container(src, box); seenMoov = true }
                "mdat" -> mediaEnd = box.end
                in PADDING -> edits += Edit.Zero(box.payload, box.end)
                !in TOP_LEVEL_KEPT -> edits += Edit.Neutralize(box)
            }
            at = box.end
        }
        return Plan(edits, src.size)
    }

    /** Une piste minutée d'un film FRAGMENTÉ (`mvex`) a ses échantillons dans les `moof` : on ne sait pas les vider, on refuse. */
    private fun container(src: ByteArray, parent: Box): List<Edit> {
        val kept = KEPT.getValue(parent.type)
        val boxes = children(src, parent)
        val fragmented = boxes.any { it.type == "mvex" }
        return boxes.flatMap { child ->
            when {
                child.type == "cmov" -> throw Unreadable()
                child.type in PADDING -> listOf(Edit.Zero(child.payload, child.end))
                child.type !in kept -> listOf(Edit.Neutralize(child))
                child.type == "trak" && handlerOf(src, child) !in MEDIA_HANDLERS ->
                    if (fragmented) throw Unreadable() else listOf(Edit.Neutralize(child)) + samplesOf(src, child)
                child.type in KEPT -> container(src, child)
                else -> emptyList()
            }
        }
    }

    private fun children(src: ByteArray, parent: Box): List<Box> {
        val boxes = mutableListOf<Box>()
        var at = parent.payload
        while (parent.end - at >= HEADER) {
            val box = readBox(src, at, parent.end)
            boxes += box
            at = box.end
        }
        if (!zero(src, at, parent.end)) throw Unreadable()
        return boxes
    }

    private fun child(src: ByteArray, parent: Box, type: String): Box? = children(src, parent).firstOrNull { it.type == type }

    private fun handlerOf(src: ByteArray, trak: Box): String? {
        val mdia = child(src, trak, "mdia") ?: return null
        val hdlr = child(src, mdia, "hdlr") ?: return null
        if (hdlr.end - hdlr.payload < 12) return null
        return String(src, hdlr.payload + 8, 4, Charsets.ISO_8859_1)
    }

    /** Les échantillons d'une piste, chunk par chunk (`stco`/`co64` × `stsc` × `stsz`), à mettre à zéro. */
    private fun samplesOf(src: ByteArray, trak: Box): List<Edit> {
        val stbl = child(src, trak, "mdia")?.let { child(src, it, "minf") }?.let { child(src, it, "stbl") } ?: return emptyList()
        val tables = children(src, stbl).associateBy { it.type }
        val stsz = tables["stsz"] ?: return if (tables.containsKey("stz2")) throw Unreadable() else emptyList()
        val stsc = tables["stsc"] ?: throw Unreadable()
        val offsets = chunkOffsets(src, tables["stco"], tables["co64"])
        val buffer = ByteBuffer.wrap(src)
        val constantSize = buffer.getInt(stsz.payload + 4)
        val sampleCount = buffer.getInt(stsz.payload + 8)
        if (sampleCount < 0 || (constantSize == 0 && stsz.payload + 12 + sampleCount.toLong() * 4 > stsz.end)) throw Unreadable()
        val runs = (0 until checkedCount(buffer, stsc, 12)).map { buffer.getInt(stsc.payload + 8 + it * 12) to buffer.getInt(stsc.payload + 12 + it * 12) }
        var sample = 0
        return offsets.mapIndexed { index, offset ->
            val perChunk = runs.lastOrNull { it.first <= index + 1 }?.second ?: throw Unreadable()
            if (perChunk < 0 || sample.toLong() + perChunk > sampleCount) throw Unreadable()
            val length = (sample until sample + perChunk).sumOf { s ->
                (if (constantSize != 0) constantSize else buffer.getInt(stsz.payload + 12 + s * 4)).toLong().and(0xFFFFFFFFL)
            }
            sample += perChunk
            if (offset < 0 || offset + length > src.size) throw Unreadable()
            Edit.Zero(offset.toInt(), (offset + length).toInt())
        }
    }

    private fun chunkOffsets(src: ByteArray, stco: Box?, co64: Box?): List<Long> {
        val buffer = ByteBuffer.wrap(src)
        return when {
            stco != null -> (0 until checkedCount(buffer, stco, 4)).map { buffer.getInt(stco.payload + 8 + it * 4).toLong().and(0xFFFFFFFFL) }
            co64 != null -> (0 until checkedCount(buffer, co64, 8)).map { buffer.getLong(co64.payload + 8 + it * 8) }
            else -> throw Unreadable()
        }
    }

    private fun checkedCount(buffer: ByteBuffer, table: Box, entryBytes: Int): Int {
        val count = buffer.getInt(table.payload + 4)
        if (count < 0 || table.payload + 8 + count.toLong() * entryBytes > table.end) throw Unreadable()
        return count
    }

    private fun readBox(src: ByteArray, at: Int, limit: Int): Box {
        if (limit - at < HEADER) throw Unreadable()
        val buffer = ByteBuffer.wrap(src)
        val declared = buffer.getInt(at).toLong().and(0xFFFFFFFFL)
        val type = String(src, at + 4, 4, Charsets.ISO_8859_1)
        val (size, header) = when (declared) {
            0L -> (limit - at).toLong() to HEADER
            1L -> {
                if (limit - at < 16) throw Unreadable()
                buffer.getLong(at + 8) to 16
            }
            else -> declared to HEADER
        }
        if (size < header || at + size > limit) throw Unreadable()
        return Box(type, at, header, (at + size).toInt())
    }
}
