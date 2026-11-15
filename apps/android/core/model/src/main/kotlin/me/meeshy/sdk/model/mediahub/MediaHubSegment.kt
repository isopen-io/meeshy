package me.meeshy.sdk.model.mediahub

import me.meeshy.sdk.model.ApiMessage

enum class MediaHubPhase {
    /** Aucun élément connu, la première page est en route — le squelette. */
    LOADING,
    LOADED,

    /** Le réseau manque : ce qui est affiché vient de l'index gardé. */
    OFFLINE,

    /** Le serveur a refusé ou échoué, et rien n'est connu localement. */
    FAILED,
}

/** D'où repart la prochaine page : la TÊTE descend jusqu'au premier porteur connu, la QUEUE reprend derrière. */
sealed interface MediaHubCursor {
    data class Head(val before: String?) : MediaHubCursor
    data class Tail(val before: String) : MediaHubCursor
    data object Done : MediaHubCursor
}

/**
 * L'état d'un segment (un genre) de l'écran, et ses transitions PURES — l'écran ne tient que ce que le réseau a servi
 * et ce que l'index a gardé. Miroir de `Segment` du modèle iOS : cache d'abord (le segment se peint avant le réseau),
 * pagination par `before` sans saut (jamais deux pages à la fois), hors ligne lisible.
 */
data class MediaHubSegment(
    val carriers: List<ApiMessage> = emptyList(),
    val cursor: MediaHubCursor = MediaHubCursor.Head(null),
    val isComplete: Boolean = false,
    val phase: MediaHubPhase = MediaHubPhase.LOADING,
    val isLoadingMore: Boolean = false,
    val loadMoreFailed: Boolean = false,
    val opened: Boolean = false,
) {
    val canLoadMore: Boolean get() = cursor != MediaHubCursor.Done

    /** L'index gardé se peint aussitôt ; COMPLET et non vide, il se sert sans réseau. */
    fun withCache(cached: List<ApiMessage>, complete: Boolean): MediaHubSegment {
        val union = ConversationMediaHubRules.union(carriers, cached)
        return when {
            union.isEmpty() -> copy(opened = true, phase = MediaHubPhase.LOADING, isComplete = complete)
            complete -> copy(carriers = union, opened = true, phase = MediaHubPhase.LOADED, isComplete = true, cursor = MediaHubCursor.Done)
            else -> copy(carriers = union, opened = true, phase = MediaHubPhase.LOADED, isComplete = false, cursor = MediaHubCursor.Head(null))
        }
    }

    /** Faut-il interroger le réseau à l'ouverture ? Un index complet se sert tel quel. */
    val needsNetworkOnOpen: Boolean get() = cursor != MediaHubCursor.Done

    /** « Une page de plus » : refusée si une page est déjà en route ou si la liste est au bout. */
    fun startLoadMore(): MediaHubSegment? =
        if (cursor == MediaHubCursor.Done || isLoadingMore || phase == MediaHubPhase.LOADING) null
        else copy(isLoadingMore = true, loadMoreFailed = false)

    fun retry(): MediaHubSegment = copy(
        opened = false,
        cursor = MediaHubCursor.Head(null),
        phase = if (carriers.isEmpty()) MediaHubPhase.LOADING else MediaHubPhase.LOADED,
        loadMoreFailed = false,
        isLoadingMore = false,
    )

    /** Le curseur à envoyer au serveur pour la prochaine page (`before`). */
    val before: String?
        get() = when (val c = cursor) {
            is MediaHubCursor.Head -> c.before
            is MediaHubCursor.Tail -> c.before
            MediaHubCursor.Done -> null
        }

    fun pageArrived(page: List<ApiMessage>, nextCursor: String?, hasMore: Boolean): MediaHubSegment {
        val knownBefore = carriers.mapTo(HashSet()) { it.id }
        val union = ConversationMediaHubRules.union(carriers, page)
        val oldestOfPage = nextCursor ?: page.lastOrNull()?.id
        val metKnown = page.any { it.id in knownBefore }
        val broughtNothing = page.all { it.id in knownBefore }
        val next = if (hasMore && oldestOfPage != null) {
            when (val c = cursor) {
                is MediaHubCursor.Head ->
                    if (!metKnown) MediaHubCursor.Head(oldestOfPage)
                    else if (isComplete) MediaHubCursor.Done
                    else union.lastOrNull()?.let { MediaHubCursor.Tail(it.id) } ?: MediaHubCursor.Done
                is MediaHubCursor.Tail -> if (!broughtNothing) MediaHubCursor.Tail(oldestOfPage) else MediaHubCursor.Done
                MediaHubCursor.Done -> MediaHubCursor.Done
            }
        } else MediaHubCursor.Done
        return copy(
            carriers = union,
            cursor = next,
            isComplete = isComplete || next == MediaHubCursor.Done,
            phase = MediaHubPhase.LOADED,
            isLoadingMore = false,
            loadMoreFailed = false,
        )
    }

    fun failed(offline: Boolean): MediaHubSegment = copy(
        phase = if (offline) MediaHubPhase.OFFLINE else if (carriers.isNotEmpty()) MediaHubPhase.LOADED else MediaHubPhase.FAILED,
        loadMoreFailed = isLoadingMore,
        isLoadingMore = false,
    )
}
