package me.meeshy.sdk.model

/** Cold-load / resolution phase for the per-link detail screen. */
public enum class ShareLinkDetailPhase { Loading, Loaded, NotFound, Error }

/**
 * Immutable UDF state for the per-link share-link detail screen (the Android take on
 * iOS `ShareLinkDetailView`, upgraded to an optimistic-update model).
 *
 * There is no per-link owner endpoint (the owner counters `currentUses` / `maxUses`
 * live only in the list payload), so the detail [resolved]s its [MyShareLink] out of
 * the fetched owner list by [MyShareLink.linkId] — a linkId absent from the list is
 * surfaced as [ShareLinkDetailPhase.NotFound] rather than an endless spinner, exactly
 * as `PostDetailViewModel` handles a missing post. Toggle applies optimistically; the
 * ViewModel snapshots and restores on network failure. Delete raises [isDeleted] so
 * the screen can pop back to a coherent place.
 */
public data class ShareLinkDetailState(
    val phase: ShareLinkDetailPhase = ShareLinkDetailPhase.Loading,
    val link: MyShareLink? = null,
    val presentation: ShareLinkDetailPresentation? = null,
    val errorMessage: String? = null,
    val isDeleted: Boolean = false,
) {
    /** A blocking placeholder is warranted only on a cold load with nothing resolved yet. */
    public val showColdSpinner: Boolean
        get() = phase == ShareLinkDetailPhase.Loading && link == null

    /** Enter the loading phase, clearing any prior error (a resolved link is kept). */
    public fun loading(): ShareLinkDetailState =
        copy(phase = ShareLinkDetailPhase.Loading, errorMessage = null)

    /**
     * Resolve the detail from the owner [links] by [linkId]. Builds the pure
     * [ShareLinkDetailPresentation] against [webOrigin] / [nowMillis] when found,
     * else settles in [ShareLinkDetailPhase.NotFound].
     */
    public fun resolved(
        links: List<MyShareLink>,
        linkId: String,
        webOrigin: String,
        nowMillis: Long,
    ): ShareLinkDetailState {
        val match = links.firstOrNull { it.linkId == linkId }
            ?: return copy(
                phase = ShareLinkDetailPhase.NotFound,
                link = null,
                presentation = null,
                errorMessage = null,
            )
        return copy(
            phase = ShareLinkDetailPhase.Loaded,
            link = match,
            presentation = ShareLinkDetailPresentation.from(match, webOrigin, nowMillis),
            errorMessage = null,
        )
    }

    /** Settle in an error phase, surfacing [message] while keeping any resolved link. */
    public fun failed(message: String?): ShareLinkDetailState =
        copy(phase = ShareLinkDetailPhase.Error, errorMessage = message)

    /**
     * Optimistically flip the resolved link's active flag (link + presentation kept in
     * step). Inert when no link is resolved.
     */
    public fun toggled(): ShareLinkDetailState {
        val current = link ?: return this
        val flipped = current.copy(isActive = !current.isActive)
        return copy(
            link = flipped,
            presentation = presentation?.copy(isActive = flipped.isActive),
        )
    }

    /** Raise the deleted signal so the screen pops back to the list. */
    public fun markDeleted(): ShareLinkDetailState = copy(isDeleted = true)

    /**
     * Dismiss a surfaced error without a reload: returns to [ShareLinkDetailPhase.Loaded]
     * when a link is resolved, else back to [ShareLinkDetailPhase.NotFound]. Inert when no
     * error is surfaced.
     */
    public fun dismissError(): ShareLinkDetailState {
        if (errorMessage == null) return this
        val restored = if (link != null) ShareLinkDetailPhase.Loaded else ShareLinkDetailPhase.NotFound
        return copy(phase = restored, errorMessage = null)
    }
}
