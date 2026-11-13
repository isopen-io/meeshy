package me.meeshy.sdk.model.call

/** La fenêtre de lecture du journal : la passerelle sert 100 phrases au plus par page, et la lecture a une borne. */
object CallTranscriptPaging {
    const val PAGE_SIZE: Int = 100

    /** 200 pages de 100 : 20 000 phrases, bien au-delà d'un appel d'une journée ; au-delà la lecture s'arrête, l'appel se disant incomplet. */
    const val MAX_PAGES: Int = 200
}

/**
 * A1.6 — la lecture du journal d'un appel EN ENTIER, page après page (miroir de iOS `CallTranscriptPaging.Reading`).
 * On continue tant que la passerelle annonce une suite ([CallTranscriptPage.hasMore]), que la page lue a apporté au moins
 * une phrase NEUVE (une page vide, ou qui répète la précédente, ne boucle jamais) et que la borne de pages n'est pas
 * atteinte. Une phrase servie par deux pages ne se garde qu'une fois, à sa première place ; la page suivante reprend après
 * ce que la passerelle a RENDU, doublons compris. Les phrases se rangent par heure de début.
 *
 * [transcript] garde le dernier `hasMore` annoncé : vrai, la lecture s'est arrêtée avant la fin et l'appel est incomplet —
 * il se montre, mais ne se range pas au cache comme s'il était entier ([CallTranscriptRevalidation]).
 */
class CallTranscriptReading private constructor(
    private val first: CallTranscriptPage,
    private val segments: List<PersistedTranscriptSegment>,
    private val seen: Set<String>,
    val offset: Int,
    private val pagesRead: Int,
    private val lastSaidMore: Boolean,
    val continues: Boolean,
) {
    fun absorbing(page: CallTranscriptPage): CallTranscriptReading = read(first, segments, seen, offset, pagesRead, page)

    /** Les captures viennent de la première page : la passerelle les rend à chaque page. */
    val transcript: CallTranscriptPage
        get() = first.copy(segments = segments.sortedBy { it.capturedAtMs }, hasMore = lastSaidMore)

    companion object {
        fun first(page: CallTranscriptPage): CallTranscriptReading = read(page, emptyList(), emptySet(), 0, 0, page)

        private fun read(
            first: CallTranscriptPage,
            kept: List<PersistedTranscriptSegment>,
            seen: Set<String>,
            offset: Int,
            pagesRead: Int,
            page: CallTranscriptPage,
        ): CallTranscriptReading {
            val known = seen.toMutableSet()
            val fresh = page.segments.filter { known.add(it.id) }
            val read = pagesRead + 1
            return CallTranscriptReading(
                first = first,
                segments = kept + fresh,
                seen = known,
                offset = offset + page.segments.size,
                pagesRead = read,
                lastSaidMore = page.hasMore,
                continues = page.hasMore && fresh.isNotEmpty() && read < CallTranscriptPaging.MAX_PAGES,
            )
        }
    }
}
