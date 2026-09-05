package me.meeshy.app.reels

/**
 * Pure reconciliation for the reel comments sheet — port of the story comments
 * overlay's reducer (`StoryCommentsReducer`), adapted to [ReelCommentPresentation].
 * The list renders chronologically (oldest first, newest at the bottom — chat
 * order); optimistic rows not yet acknowledged keep their insertion order at the
 * tail so a background refresh never drops an unsent comment.
 */
object ReelCommentsReducer {

    /**
     * Folds a freshly loaded server page into the current list: server comments
     * (deduped by id, oldest-first) form the acknowledged section, while optimistic
     * rows still in flight (Pending/Failed and not yet present on the server) are
     * kept at the tail.
     */
    fun merged(
        current: List<ReelCommentPresentation>,
        loaded: List<ReelCommentPresentation>,
    ): List<ReelCommentPresentation> {
        val serverById = loaded.associateBy { it.id }
        val sorted = serverById.values.sortedWith(byCreatedAt)
        val pendingTail = current.filter {
            it.status != ReelCommentStatus.Sent && it.id !in serverById
        }
        return sorted + pendingTail
    }

    /** Appends an optimistic comment to the tail. */
    fun posting(
        current: List<ReelCommentPresentation>,
        optimistic: ReelCommentPresentation,
    ): List<ReelCommentPresentation> = current + optimistic

    /**
     * Reconciles a server ACK: the optimistic row carrying [clientId] becomes the
     * acknowledged [server] comment. If a realtime echo already delivered that server
     * comment (same id), the optimistic duplicate is removed instead. An ACK for an
     * unknown client id is appended only when its id is not already present.
     */
    fun confirmed(
        current: List<ReelCommentPresentation>,
        clientId: String,
        server: ReelCommentPresentation,
    ): List<ReelCommentPresentation> {
        val echoAlreadyPresent = current.any { it.id == server.id && it.clientId == null }
        if (echoAlreadyPresent) {
            return current.filterNot { it.clientId == clientId }
        }
        val index = current.indexOfFirst { it.clientId == clientId }
        if (index < 0) {
            return if (current.any { it.id == server.id }) current else current + server
        }
        return current.toMutableList().apply { set(index, server) }
    }

    /** Marks the optimistic row carrying [clientId] as failed; inert when unknown. */
    fun failed(current: List<ReelCommentPresentation>, clientId: String): List<ReelCommentPresentation> =
        current.map {
            if (it.clientId == clientId) it.copy(status = ReelCommentStatus.Failed) else it
        }

    /** Appends a realtime [incoming] comment, deduped by id (inert if already shown). */
    fun received(
        current: List<ReelCommentPresentation>,
        incoming: ReelCommentPresentation,
    ): List<ReelCommentPresentation> =
        if (current.any { it.id == incoming.id }) current else current + incoming

    /**
     * Folds an older page fetched via `loadMore` — one step further back along the
     * server's cursor — into the current list. Unlike [merged], which REPLACES the
     * acknowledged section with a fresh first page, this PREPENDS: the sheet renders
     * oldest-first, so a page fetched further back in time belongs chronologically
     * BEFORE everything already shown, and the section [merged] already reconciled
     * (including any earlier `loadMore` pages) is kept in full rather than discarded.
     * Deduped by id against the current list, sorted ascending among themselves so a
     * page whose items arrive in the server's own descending order still reads
     * oldest-first once prepended.
     */
    fun appendedOlderPage(
        current: List<ReelCommentPresentation>,
        olderPage: List<ReelCommentPresentation>,
    ): List<ReelCommentPresentation> {
        val knownIds = current.mapTo(HashSet()) { it.id }
        val fresh = olderPage.filter { it.id !in knownIds }.sortedWith(byCreatedAt)
        return fresh + current
    }

    private val byCreatedAt: Comparator<ReelCommentPresentation> =
        compareBy({ it.createdAt == null }, { it.createdAt })
}
