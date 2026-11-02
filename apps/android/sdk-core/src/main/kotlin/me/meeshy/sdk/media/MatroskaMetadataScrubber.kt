package me.meeshy.sdk.media

/**
 * **Le retrait des métadonnées d'une vidéo ou d'un son WebM / Matroska, SANS réencodage ni déplacement d'octet** (#13543).
 *
 * Même principe que [IsoMediaMetadataScrubber] : un élément retiré devient un élément `Void` (0xEC) de MÊME taille, contenu
 * mis à zéro — aucune position (SeekHead, Cues) ne bouge. Liste BLANCHE au niveau du segment : `SeekHead`, `Info`, `Tracks`,
 * `Cues`, `Cluster`, `Void`, `CRC-32` restent ; `Tags` (où un enregistreur pose `LOCATION`), `Attachments`, `Chapters` (texte
 * libre) deviennent `Void` ; un élément de premier niveau INCONNU fait refuser le fichier. Dans `Info` ne restent que
 * l'échelle de temps, la durée et l'identifiant du segment (titre, nom de fichier, date, applications : `Void`) ; seules
 * les pistes vidéo et audio sont admises, réduites à leurs champs techniques, en liste blanche à chaque niveau (`Video`, `Colour`,
 * `MasteringMetadata`, `Projection`, `Audio` ; nom, langue, nom de codec, `BlockAdditionMapping`, tout élément inconnu : `Void`) ; toute AUTRE piste (sous-titres, métadonnées, complex, boutons — #13543, revue de sécurité) devient `Void`, et
 * tout bloc dont la piste n'est pas admise — déclarée ou non — aussi, comme chaque `BlockAdditions`. Un `Cluster` de taille inconnue (enregistrement en direct) se
 * parcourt jusqu'au prochain élément de premier niveau. Tout ce qui ne se lit pas rend `null` : l'appelant refuse l'envoi.
 *
 * Le fichier se parcourt PAR SES EN-TÊTES ([MediaBytes], [EbmlElements], #13551) et le plan ([MediaPlan]) s'applique en
 * flux : un WebM de 200 Mo se nettoie sans qu'aucun tableau de sa taille n'existe.
 */
internal object MatroskaMetadataScrubber {
    private const val EBML = 0x1A45DFA3L
    private const val SEGMENT = 0x18538067L
    private const val CLUSTER = 0x1F43B675L
    private const val INFO = 0x1549A966L
    private const val TRACKS = 0x1654AE6BL
    private const val TRACK_ENTRY = 0xAEL
    private const val VOID = 0xECL
    private const val CRC32 = 0xBFL
    private val SEGMENT_KEPT = setOf(0x114D9B74L, 0x1C53BB6BL, CLUSTER, VOID, CRC32)
    private val DROPPED = setOf(0x1254C367L, 0x1941A469L, 0x1043A770L)
    private val LEVEL_ONE = SEGMENT_KEPT + DROPPED + setOf(INFO, TRACKS)
    private val INFO_KEPT = setOf(0x2AD7B1L, 0x4489L, 0x73A4L, CRC32)
    private const val TRACK_NUMBER = 0xD7L
    private const val TRACK_TYPE = 0x83L
    private const val CODEC_ID = 0x86L
    private const val CONTENT_ENCODINGS = 0x6D80L

    /** Une liste blanche par conteneur : ses champs techniques ([leaves]) et ses sous-conteneurs, eux-mêmes en liste blanche. */
    private class Schema(leaves: Set<Long>, val containers: Map<Long, Schema> = emptyMap()) {
        val leaves: Set<Long> = leaves + CRC32
    }

    private val MASTERING = Schema((0x55D1L..0x55DAL).toSet())
    private val COLOUR = Schema((0x55B1L..0x55BDL).toSet(), mapOf(0x55D0L to MASTERING))
    private val PROJECTION = Schema(setOf(0x7671L, 0x7672L, 0x7673L, 0x7674L, 0x7675L))
    private val VIDEO = Schema(
        setOf(
            0x9AL, 0x9DL, 0x53B8L, 0x53C0L, 0x53B9L, 0xB0L, 0xBAL, 0x54AAL, 0x54BBL, 0x54CCL, 0x54DDL, 0x54B0L, 0x54BAL,
            0x54B2L, 0x54B3L, 0x2EB524L, 0x2FB523L, 0x2383E3L,
        ),
        mapOf(0x55B0L to COLOUR, 0x7670L to PROJECTION),
    )
    private val AUDIO = Schema(setOf(0xB5L, 0x78B5L, 0x9FL, 0x7D7BL, 0x6264L, 0x52F1L))
    private val TRACK = Schema(
        setOf(
            0xD7L, 0x73C5L, 0x83L, 0xB9L, 0x88L, 0x55AAL, 0x9CL, 0x6DE7L, 0x6DF8L, 0x23E383L, 0x234E7AL, 0x23314FL, 0x55EEL,
            0x86L, 0x63A2L, 0x56AAL, 0x56BBL, 0xAAL,
        ),
        mapOf(0xE0L to VIDEO, 0xE1L to AUDIO),
    )
    private const val TYPE_VIDEO = 1L
    private const val TYPE_AUDIO = 2L
    private const val SIMPLE_BLOCK = 0xA3L
    private const val BLOCK_GROUP = 0xA0L
    private const val BLOCK = 0xA1L
    private val CLUSTER_KEPT = setOf(0xE7L, 0x5854L, 0xA7L, 0xABL, CRC32)
    private val BLOCK_GROUP_KEPT = setOf(BLOCK, 0x9BL, 0xFAL, 0xFBL, 0xA4L, 0x75A2L, 0x8EL, CRC32)

    fun looksLikeMatroska(media: MediaBytes): Boolean = media.startsWithAt(0, MAGIC)

    private val MAGIC = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte())

    /** Le plan qui vide `Tags`, `Attachments`, titres et champs non techniques — l'identité s'il n'y a rien — ou `null` s'il est illisible. */
    fun plan(media: MediaBytes): MediaPlan? {
        val voids = runCatching { voidsOf(media) }.getOrNull() ?: return null
        val edits = voids.filterNot { it.isVoidOf(media) }.flatMap { MediaEdit.ebmlVoid(it.offset, it.end) }
        return MediaPlan.edited(media.size, edits)
    }

    private fun voidsOf(media: MediaBytes): List<EbmlElement> {
        val first = EbmlElements.read(media, 0, media.size)
        if (first.id != EBML || first.unknownSize) throw UnreadableMediaException("no EBML header")
        val voids = mutableListOf<EbmlElement>()
        var at = first.end
        while (at < media.size) {
            val element = EbmlElements.read(media, at, media.size)
            when (element.id) {
                SEGMENT -> voids += segment(media, element)
                VOID -> voids += element
                else -> throw UnreadableMediaException("top-level ${element.id.toString(16)}")
            }
            at = element.end
        }
        return voids
    }

    private fun segment(media: MediaBytes, segment: EbmlElement): List<EbmlElement> {
        val elements = mutableListOf<EbmlElement>()
        var at = segment.dataStart
        while (at < segment.end) {
            val element = EbmlElements.read(media, at, segment.end)
            val end = if (element.unknownSize) unknownClusterEnd(media, element, segment.end) else element.end
            if (element.id !in SEGMENT_KEPT && element.id !in DROPPED && element.id != INFO && element.id != TRACKS) throw UnreadableMediaException("segment child")
            elements += if (element.unknownSize) EbmlElement(element.id, element.offset, element.dataStart, end, unknownSize = true) else element
            at = end
        }
        val tracks = elements.filter { it.id == TRACKS }.map { tracks(media, it) }
        val numbers = tracks.flatMap { it.declared }
        if (numbers.size != numbers.toSet().size) throw UnreadableMediaException("track declared twice")
        val admitted = tracks.flatMap { it.admitted }.toSet()
        return tracks.flatMap { it.voids } + elements.flatMap { element ->
            when (element.id) {
                in DROPPED, VOID -> listOf(element)
                INFO -> EbmlElements.children(media, element).filter { it.id !in INFO_KEPT }
                CLUSTER -> cluster(media, element, admitted)
                else -> emptyList()
            }
        }
    }

    private class TrackPlan(val voids: List<EbmlElement>, val declared: List<Long>, val admitted: List<Long>)

    /**
     * Seules les pistes VIDÉO (`V_…`) et AUDIO (`A_…`) sont ADMISES, et un bloc ne reste que si sa piste l'est : une piste de
     * sous-titres, de métadonnées, « complex », de boutons ou de logo — du texte libre où une application écrit sa télémétrie —
     * devient `Void`, et tout bloc d'une piste non admise aussi, qu'elle soit déclarée ou non. Un numéro déclaré deux fois fait
     * refuser. Dans une piste admise ne restent que ses champs TECHNIQUES ([TRACK], liste blanche par conteneur) : tout autre devient `Void`. Une piste
     * dont le contenu est encodé (`ContentEncodings` : compression, chiffrement) ne se vérifie pas : refusée.
     */
    private fun tracks(media: MediaBytes, tracks: EbmlElement): TrackPlan {
        val voids = mutableListOf<EbmlElement>()
        val declared = mutableListOf<Long>()
        val admitted = mutableListOf<Long>()
        EbmlElements.children(media, tracks).forEach { entry ->
            when (entry.id) {
                TRACK_ENTRY -> {
                    val fields = EbmlElements.children(media, entry)
                    if (fields.any { it.id == CONTENT_ENCODINGS }) throw UnreadableMediaException("encoded track")
                    val number = fields.singleOrNull { it.id == TRACK_NUMBER }?.let { EbmlElements.uint(media, it) } ?: throw UnreadableMediaException("track number")
                    val type = fields.singleOrNull { it.id == TRACK_TYPE }?.let { EbmlElements.uint(media, it) } ?: throw UnreadableMediaException("track type")
                    val codec = fields.singleOrNull { it.id == CODEC_ID }?.let { codecOf(media, it) }.orEmpty()
                    declared += number
                    if ((type == TYPE_VIDEO && codec.startsWith("V_")) || (type == TYPE_AUDIO && codec.startsWith("A_"))) {
                        admitted += number
                        voids += allowListed(media, fields, TRACK)
                    } else {
                        voids += entry
                    }
                }
                VOID -> voids += entry
                CRC32 -> Unit
                else -> throw UnreadableMediaException("tracks child")
            }
        }
        return TrackPlan(voids, declared, admitted)
    }

    /** Un identifiant de codec : seul son préfixe compte (`V_`, `A_`), lu sans jamais charger un champ démesuré. */
    private fun codecOf(media: MediaBytes, element: EbmlElement): String =
        media.ascii(element.dataStart, minOf(element.end - element.dataStart, CODEC_PREFIX).toInt())

    private const val CODEC_PREFIX = 2L

    /** Ce qui n'est pas un champ technique connu du conteneur devient `Void`, à chaque niveau (Video, Colour, Audio…). */
    private fun allowListed(media: MediaBytes, fields: List<EbmlElement>, schema: Schema): List<EbmlElement> = fields.flatMap { field ->
        val nested = schema.containers[field.id]
        when {
            nested != null -> allowListed(media, EbmlElements.children(media, field), nested)
            field.id in schema.leaves -> emptyList()
            else -> listOf(field)
        }
    }

    /** Un bloc d'une piste non admise devient `Void`, un `BlockAdditions` aussi, tout enfant de cluster inconnu aussi. */
    private fun cluster(media: MediaBytes, cluster: EbmlElement, admitted: Set<Long>): List<EbmlElement> = EbmlElements.children(media, cluster).flatMap { child ->
        when (child.id) {
            SIMPLE_BLOCK -> if (blockTrack(media, child) in admitted) emptyList() else listOf(child)
            BLOCK_GROUP -> blockGroup(media, child, admitted)
            VOID -> listOf(child)
            in CLUSTER_KEPT -> emptyList()
            else -> listOf(child)
        }
    }

    private fun blockGroup(media: MediaBytes, group: EbmlElement, admitted: Set<Long>): List<EbmlElement> {
        val fields = EbmlElements.children(media, group)
        val block = fields.singleOrNull { it.id == BLOCK } ?: throw UnreadableMediaException("block group without one block")
        if (blockTrack(media, block) !in admitted) return listOf(group)
        return fields.filter { it.id !in BLOCK_GROUP_KEPT }
    }

    private fun blockTrack(media: MediaBytes, block: EbmlElement): Long {
        val (track, length) = EbmlElements.vint(media, block.dataStart, keepMarker = false)
        if (block.dataStart + length > block.end) throw UnreadableMediaException("block track")
        return track
    }

    private fun unknownClusterEnd(media: MediaBytes, cluster: EbmlElement, limit: Long): Long {
        if (cluster.id != CLUSTER) throw UnreadableMediaException("unknown size outside a cluster")
        var at = cluster.dataStart
        while (at < limit) {
            val (id, _) = EbmlElements.vint(media, at, keepMarker = true)
            if (id in LEVEL_ONE) return at
            val element = EbmlElements.read(media, at, limit)
            if (element.unknownSize) throw UnreadableMediaException("nested unknown size")
            at = element.end
        }
        return limit
    }

    private fun EbmlElement.isVoidOf(media: MediaBytes): Boolean = id == VOID && media.isZero(dataStart, end)
}
