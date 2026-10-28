package me.meeshy.sdk.media

import java.nio.ByteBuffer

/**
 * **Le retrait du lieu d'une vidéo ou d'un son MP4 / MOV / 3GP / M4A, SANS réencodage ni déplacement d'octet** (#13543, #13490).
 *
 * Une boîte retirée n'est pas supprimée : elle devient une boîte `free` de MÊME taille, contenu mis à zéro. Aucun
 * décalage ne bouge donc — les `stco`/`co64` restent justes, `moov` reste devant `mdat` si c'était le cas (lecture
 * progressive), les pistes, leurs horloges et la matrice de rotation du `tkhd` ne changent pas d'un octet.
 *
 * Liste BLANCHE à chaque niveau parcouru (`moov`, `trak`, `mdia`, `minf`, `edts`, `mvex`, et dans un film FRAGMENTÉ
 * `moof`, `traf`, `mfra`, où la norme admet aussi `udta` et `meta`) : tout le reste tombe — `emsg` compris —
 * `udta` (`©xyz` qu'écrit `MediaMuxer.setLocation`, `loci` 3GPP, XMP), `meta` (`keys`/`ilst` d'Apple dont
 * `com.apple.quicktime.location.ISO6709`), `uuid` (XMP), aperçus `pnot`/`PICT`. Les remplissages (`free`, `skip`, `wide`)
 * sont vidés : un logiciel de montage y laisse d'anciens `moov`. Une piste qui n'est ni image, ni son, ni code temporel
 * (métadonnées minutées : `mebx` de l'iPhone, `camm`, `gpmd`, qui portent un lieu PAR IMAGE ; mais aussi sous-titres et
 * chapitres, du texte libre où une caméra de drone écrit sa télémétrie) disparaît et ses échantillons sont mis à zéro dans
 * `mdat`. Des octets illisibles APRÈS le film complet (traîne de fabricant) sont coupés. Tout le reste d'illisible —
 * `moov` compressé (`cmov`), tailles incohérentes, piste minutée fragmentée, référence de données vers un fichier extérieur
 * (`dref` non autonome : une URL libre) — rend `null` : l'appelant refuse l'envoi plutôt que de laisser partir l'original.
 *
 * Le fichier se parcourt PAR SES EN-TÊTES ([MediaBytes], #13551) et le plan ([MediaPlan]) s'applique en flux : une vidéo de
 * 200 Mo se nettoie sans qu'aucun tableau de sa taille n'existe.
 */
internal object IsoMediaMetadataScrubber {
    private val PADDING = setOf("free", "skip", "wide")
    private val TOP_LEVEL_KEPT = setOf("ftyp", "moov", "mdat", "moof", "mfra", "sidx", "ssix", "styp", "pdin", "prft") + PADDING
    private val KEPT = mapOf(
        "moov" to setOf("mvhd", "trak", "mvex", "iods"),
        "moof" to setOf("mfhd", "traf", "pssh"),
        "traf" to setOf("tfhd", "tfdt", "trun", "sbgp", "sgpd", "subs", "saiz", "saio", "senc"),
        "mfra" to setOf("tfra", "mfro"),
        "trak" to setOf("tkhd", "edts", "mdia", "tref", "tapt", "trgr", "load", "txas"),
        "mdia" to setOf("mdhd", "hdlr", "minf", "elng"),
        "minf" to setOf("vmhd", "smhd", "hmhd", "nmhd", "sthd", "gmhd", "hdlr", "dinf", "stbl"),
        "edts" to setOf("elst"),
        "dinf" to setOf("dref"),
        "mvex" to setOf("mehd", "trex", "trep", "leva"),
    )
    private val MEDIA_HANDLERS = setOf("vide", "soun", "tmcd", "auxv", "pict")
    private const val SELF_CONTAINED = 1

    /** Vrai quand ces octets commencent comme un fichier ISO sans `ftyp` (ancien QuickTime) : une boîte connue, de taille plausible. */
    fun looksLikeIsoMedia(media: MediaBytes): Boolean = runCatching {
        val first = IsoBoxes.read(media, 0, media.size)
        first.type in setOf("moov", "mdat", "wide", "free", "skip", "pnot") && first.end <= media.size
    }.getOrDefault(false)

    /** Le plan qui retire lieu et métadonnées — l'identité quand il n'y a rien à retirer — ou `null` si le fichier est illisible. */
    fun plan(media: MediaBytes): MediaPlan? = runCatching { planOf(media) }.getOrNull()

    private fun neutralize(box: IsoBox): List<MediaEdit> = MediaEdit.isoFree(box.offset, box.payload, box.end)

    private fun planOf(media: MediaBytes): MediaPlan {
        val edits = mutableListOf<MediaEdit>()
        var at = 0L
        var seenMoov = false
        var mediaEnd = -1L
        while (at < media.size) {
            val box = runCatching { IsoBoxes.read(media, at, media.size) }.getOrNull()
            if (box == null) {
                if (!seenMoov || mediaEnd < 0) throw UnreadableMediaException("unreadable box at $at")
                return MediaPlan.edited(at, edits)
            }
            when (box.type) {
                "moov" -> { edits += container(media, box); seenMoov = true }
                "moof", "mfra" -> edits += container(media, box)
                "mdat" -> mediaEnd = box.end
                in PADDING -> edits += MediaEdit.Zero(box.payload, box.end)
                !in TOP_LEVEL_KEPT -> edits += neutralize(box)
            }
            at = box.end
        }
        return MediaPlan.edited(media.size, edits)
    }

    /** Une piste minutée d'un film FRAGMENTÉ (`mvex`) a ses échantillons dans les `moof` : on ne sait pas les vider, on refuse. */
    private fun container(media: MediaBytes, parent: IsoBox): List<MediaEdit> {
        val kept = KEPT.getValue(parent.type)
        val boxes = IsoBoxes.children(media, parent)
        val fragmented = boxes.any { it.type == "mvex" }
        return boxes.flatMap { child ->
            when {
                child.type == "cmov" -> throw UnreadableMediaException("compressed moov")
                child.type in PADDING -> listOf(MediaEdit.Zero(child.payload, child.end))
                child.type !in kept -> neutralize(child)
                child.type == "trak" && handlerOf(media, child) !in MEDIA_HANDLERS ->
                    if (fragmented) throw UnreadableMediaException("fragmented timed track") else neutralize(child) + samplesOf(media, child)
                child.type in KEPT -> container(media, child)
                child.type == "dref" -> selfContained(media, child)
                else -> emptyList()
            }
        }
    }

    /**
     * Une référence de données ne porte qu'un drapeau « dans ce fichier » : une entrée qui nomme un fichier extérieur — donc
     * une chaîne libre, où un lieu tiendrait — n'est pas réécrite, elle fait refuser l'envoi.
     */
    private fun selfContained(media: MediaBytes, dref: IsoBox): List<MediaEdit> {
        val entries = IsoBoxes.children(media, dref, payloadOffset = 8)
        val local = entries.all { entry -> entry.end - entry.payload == 4L && (media.i32At(entry.payload) and SELF_CONTAINED) != 0 }
        return if (local) emptyList() else throw UnreadableMediaException("external data reference")
    }

    private fun child(media: MediaBytes, parent: IsoBox, type: String): IsoBox? = IsoBoxes.children(media, parent).firstOrNull { it.type == type }

    private fun handlerOf(media: MediaBytes, trak: IsoBox): String? {
        val mdia = child(media, trak, "mdia") ?: return null
        val hdlr = child(media, mdia, "hdlr") ?: return null
        if (hdlr.end - hdlr.payload < 12) return null
        return media.ascii(hdlr.payload + 8, 4)
    }

    /** Les échantillons d'une piste, chunk par chunk (`stco`/`co64` × `stsc` × `stsz`), à mettre à zéro. */
    private fun samplesOf(media: MediaBytes, trak: IsoBox): List<MediaEdit> {
        val stbl = child(media, trak, "mdia")?.let { child(media, it, "minf") }?.let { child(media, it, "stbl") } ?: return emptyList()
        val tables = IsoBoxes.children(media, stbl).associateBy { it.type }
        val stsz = tables["stsz"] ?: return if (tables.containsKey("stz2")) throw UnreadableMediaException("stz2") else emptyList()
        val stsc = tables["stsc"] ?: throw UnreadableMediaException("no stsc")
        val offsets = chunkOffsets(media, tables["stco"], tables["co64"])
        val constantSize = media.i32At(stsz.payload + 4)
        val sampleCount = media.i32At(stsz.payload + 8)
        if (sampleCount < 0 || (constantSize == 0 && stsz.payload + 12 + sampleCount.toLong() * 4 > stsz.end)) throw UnreadableMediaException("stsz")
        val runs = (0 until checkedCount(media, stsc, 12)).map { media.i32At(stsc.payload + 8 + it * 12L) to media.i32At(stsc.payload + 12 + it * 12L) }
        var sample = 0
        return offsets.mapIndexed { index, offset ->
            val perChunk = runs.lastOrNull { it.first <= index + 1 }?.second ?: throw UnreadableMediaException("stsc run")
            if (perChunk < 0 || sample.toLong() + perChunk > sampleCount) throw UnreadableMediaException("stsc count")
            val length = (sample until sample + perChunk).sumOf { s ->
                (if (constantSize != 0) constantSize.toLong() else media.u32At(stsz.payload + 12 + s * 4L)).and(0xFFFFFFFFL)
            }
            sample += perChunk
            if (offset < 0 || offset + length > media.size) throw UnreadableMediaException("chunk past the end")
            MediaEdit.Zero(offset, offset + length)
        }
    }

    private fun chunkOffsets(media: MediaBytes, stco: IsoBox?, co64: IsoBox?): List<Long> = when {
        stco != null -> (0 until checkedCount(media, stco, 4)).map { media.u32At(stco.payload + 8 + it * 4L) }
        co64 != null -> (0 until checkedCount(media, co64, 8)).map { media.i64At(co64.payload + 8 + it * 8L) }
        else -> throw UnreadableMediaException("no chunk offsets")
    }

    private fun checkedCount(media: MediaBytes, table: IsoBox, entryBytes: Int): Int {
        val count = media.i32At(table.payload + 4)
        if (count < 0 || table.payload + 8 + count.toLong() * entryBytes > table.end) throw UnreadableMediaException("table count")
        return count
    }
}
