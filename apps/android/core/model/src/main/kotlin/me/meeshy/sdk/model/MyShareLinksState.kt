package me.meeshy.sdk.model

/** Cold-load / refresh phase for the user's own share-links screen. */
public enum class MyShareLinksPhase { Loading, Loaded, Error }

/**
 * Immutable UDF state for the user's own share-links management screen (port of the
 * iOS `ShareLinksViewModel` surface, upgraded to an optimistic-update model).
 *
 * The reducer methods return new instances and mutate the [links] list
 * optimistically, keeping the aggregate [stats] locally consistent so the UI
 * reflects an activate/deactivate/delete instantly — no server round-trip before
 * feedback. The [MyShareLinkStats.totalUses] adjustment on [removed] is exact, not
 * a guess: the gateway derives it as `_sum(currentUses)` over the user's links
 * (`services/gateway/src/routes/links/user.ts`), so dropping a link's own
 * `currentUses` mirrors the server. The ViewModel snapshots the prior state and
 * restores it on network failure (Instant-App rollback).
 */
public data class MyShareLinksState(
    val links: List<MyShareLink> = emptyList(),
    val stats: MyShareLinkStats? = null,
    val phase: MyShareLinksPhase = MyShareLinksPhase.Loading,
    val errorMessage: String? = null,
) {
    /** No links to show. */
    public val isEmpty: Boolean get() = links.isEmpty()

    /**
     * A blocking placeholder is warranted only on a cold, still-empty load — never
     * a spinner over data the user can already see (cache-first / instant-app).
     */
    public val showColdSpinner: Boolean get() = phase == MyShareLinksPhase.Loading && links.isEmpty()

    /** The empty-state card shows only once a load settled with nothing to show. */
    public val showEmptyState: Boolean get() = phase == MyShareLinksPhase.Loaded && links.isEmpty()

    /** Enter the loading phase, clearing any prior error (existing links are kept). */
    public fun loading(): MyShareLinksState =
        copy(phase = MyShareLinksPhase.Loading, errorMessage = null)

    /**
     * Settle with fresh [links] and (when present) fresh [stats]; a null [stats]
     * keeps the last known aggregate so a stats-only fetch failure never blanks the
     * header.
     */
    public fun loaded(links: List<MyShareLink>, stats: MyShareLinkStats?): MyShareLinksState =
        copy(
            links = links,
            stats = stats ?: this.stats,
            phase = MyShareLinksPhase.Loaded,
            errorMessage = null,
        )

    /** Settle in an error phase, surfacing [message] while keeping any prior links. */
    public fun failed(message: String?): MyShareLinksState =
        copy(phase = MyShareLinksPhase.Error, errorMessage = message)

    /**
     * Optimistically flip one link's active flag (matched by [MyShareLink.linkId],
     * the action key), keeping `activeLinks` in step. An unknown [linkId] is inert.
     */
    public fun toggled(linkId: String): MyShareLinksState {
        val target = links.firstOrNull { it.linkId == linkId } ?: return this
        val updated = links.map {
            if (it.linkId == linkId) it.copy(isActive = !it.isActive) else it
        }
        val nextStats = stats?.let {
            val delta = if (target.isActive) -1 else 1
            it.copy(activeLinks = (it.activeLinks + delta).coerceAtLeast(0))
        }
        return copy(links = updated, stats = nextStats)
    }

    /**
     * Optimistically remove one link (matched by [MyShareLink.linkId]) and decrement
     * the aggregate counters — `totalLinks` always, `activeLinks` only if it was
     * active, and `totalUses` by the removed link's own `currentUses`. An unknown
     * [linkId] is inert.
     */
    public fun removed(linkId: String): MyShareLinksState {
        val target = links.firstOrNull { it.linkId == linkId } ?: return this
        val updated = links.filterNot { it.linkId == linkId }
        val nextStats = stats?.let {
            it.copy(
                totalLinks = (it.totalLinks - 1).coerceAtLeast(0),
                activeLinks = (it.activeLinks - if (target.isActive) 1 else 0).coerceAtLeast(0),
                totalUses = (it.totalUses - target.currentUses).coerceAtLeast(0),
            )
        }
        return copy(links = updated, stats = nextStats)
    }

    /**
     * Optimistically set a new [expiresAtIso] on one link (matched by
     * [MyShareLink.linkId]). Extending changes no aggregate counter, so [stats] is
     * left untouched. An unknown [linkId] is inert.
     */
    public fun extended(linkId: String, expiresAtIso: String): MyShareLinksState {
        if (links.none { it.linkId == linkId }) return this
        val updated = links.map {
            if (it.linkId == linkId) it.copy(expiresAt = expiresAtIso) else it
        }
        return copy(links = updated)
    }
}
