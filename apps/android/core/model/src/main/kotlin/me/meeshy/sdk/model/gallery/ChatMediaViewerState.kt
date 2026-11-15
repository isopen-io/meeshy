package me.meeshy.sdk.model.gallery

public enum class ViewerPageKind { IMAGE, VIDEO }

/** Une page du plein écran de conversation, suivie par son IDENTITÉ (id de pièce jointe), jamais par sa position. */
public data class ViewerPage(val id: String, val kind: ViewerPageKind)

/**
 * L'état pur du plein écran de conversation — miroir de `ConversationMediaGalleryView` : ouverture sur la page tapée,
 * balayage mixte image/vidéo, fermeture qui restitue la position de la vidéo au lecteur inline.
 *
 * La page courante est tenue par son identité : quand la fenêtre de la conversation grandit au-dessus (pagination des
 * médias plus anciens) ou perd une page, l'index se recalcule et le spectateur reste sur le même média.
 */
public data class ChatMediaViewerState(
    val pages: List<ViewerPage> = emptyList(),
    val currentId: String? = null,
    val inlineResumeMs: Map<String, Long> = emptyMap(),
    val isOpen: Boolean = false,
) {
    val currentIndex: Int get() = pages.indexOfFirst { it.id == currentId }.coerceAtLeast(0)

    val currentPage: ViewerPage? get() = pages.getOrNull(currentIndex)

    /** « 3 sur 12 » pour TalkBack : (rang à partir de 1, total). */
    val position: Pair<Int, Int> get() = (currentIndex + 1) to pages.size

    /** La position, en ms, à laquelle le lecteur plein écran reprend la vidéo courante (celle du lecteur inline à l'ouverture). */
    val startPositionMs: Long get() = currentPage?.let { inlineResumeMs[it.id] } ?: 0L

    public fun open(pages: List<ViewerPage>, startId: String, inlinePositionMs: Long = 0L): ChatMediaViewerState {
        if (pages.isEmpty()) return this
        val start = pages.firstOrNull { it.id == startId } ?: pages.first()
        val resume = if (start.kind == ViewerPageKind.VIDEO && inlinePositionMs > 0L) mapOf(start.id to inlinePositionMs) else emptyMap()
        return ChatMediaViewerState(pages = pages, currentId = start.id, inlineResumeMs = resume, isOpen = true)
    }

    public fun settle(index: Int): ChatMediaViewerState {
        val page = pages.getOrNull(index) ?: return this
        return if (page.id == currentId) this else copy(currentId = page.id)
    }

    /** La conversation a changé sous le plein écran : on reste sur le même média, ou au plus proche voisin s'il a disparu. */
    public fun replacePages(next: List<ViewerPage>): ChatMediaViewerState {
        if (!isOpen) return this
        if (next.isEmpty()) return close()
        if (next.any { it.id == currentId }) return copy(pages = next)
        val fallback = next[currentIndex.coerceIn(0, next.lastIndex)]
        return copy(pages = next, currentId = fallback.id)
    }

    public fun recordVideoPosition(id: String, positionMs: Long): ChatMediaViewerState =
        copy(inlineResumeMs = inlineResumeMs + (id to positionMs.coerceAtLeast(0L)))

    /** Fermer : la vidéo courante restitue sa position au lecteur inline ([VideoResume]), le reste est oublié. */
    public fun close(): ChatMediaViewerState = ChatMediaViewerState(inlineResumeMs = inlineResumeMs)

    public fun resumeOnClose(): VideoResume? =
        currentPage?.takeIf { it.kind == ViewerPageKind.VIDEO }?.let { page -> inlineResumeMs[page.id]?.let { VideoResume(page.id, it) } }
}

public data class VideoResume(val pageId: String, val positionMs: Long)

/** La fenêtre de rendu BORNÉE d'un pager : seules les pages voisines de la courante sont composées. */
public object GalleryRenderWindow {
    public const val RADIUS: Int = 1

    public fun around(current: Int, total: Int, radius: Int = RADIUS): IntRange =
        if (total <= 0) IntRange.EMPTY else (current - radius).coerceAtLeast(0)..(current + radius).coerceAtMost(total - 1)
}
