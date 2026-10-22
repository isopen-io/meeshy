package me.meeshy.sdk.model.chat

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** Une ligne de la liste, réduite à ce que le préchargement en lit. */
data class PrefetchCandidate(
    val conversationId: String,
    val lastMessageId: String?,
    val lastMessageAtMillis: Long,
) {
    /** Le dernier message que la LIGNE annonce — ce qu'une passe réussie a déjà rapporté. */
    val latestMark: String get() = lastMessageId ?: "@$lastMessageAtMillis"
}

/** Ce que la base locale (Room, la table que le fil peint) détient d'une conversation. */
data class HeldMessageWindow(
    val count: Int,
    val serverIds: Set<String>,
    val newestServerCreatedAtMillis: Long?,
) {
    /** La fenêtre contient-elle le dernier message que la ligne annonce ? */
    fun holdsLatest(candidate: PrefetchCandidate): Boolean {
        if (candidate.lastMessageId != null && candidate.lastMessageId in serverIds) return true
        val newest = newestServerCreatedAtMillis ?: return false
        return newest >= candidate.lastMessageAtMillis
    }

    companion object {
        val EMPTY = HeldMessageWindow(count = 0, serverIds = emptySet(), newestServerCreatedAtMillis = null)
    }
}

/**
 * Loi du préchargement des messages des premières conversations de la liste — miroir de
 * `ConversationListMessagePrefetcher` (iOS, #10572).
 */
object MessagePrefetchPlan {
    const val MAX_CONVERSATIONS = 20

    /** La page de la revalidation d'ouverture. */
    const val PAGE_LIMIT = 30

    /** Un écran plein de bulles, avec de la marge. */
    const val MINIMUM_HELD_WINDOW = 20
    const val MAX_CONCURRENT_FETCHES = 4

    /** Les premières lignes à identifiant NON VIDE, dans l'ordre. */
    fun targets(conversations: List<ApiConversation>): List<PrefetchCandidate> =
        conversations
            .filter { it.id.isNotEmpty() }
            .take(MAX_CONVERSATIONS)
            .map {
                PrefetchCandidate(
                    conversationId = it.id,
                    lastMessageId = it.lastMessage?.id?.takeIf(String::isNotEmpty),
                    lastMessageAtMillis = isoToEpochMillisOrNull(it.lastMessage?.createdAt)
                        ?: isoToEpochMillisOrNull(it.updatedAt)
                        ?: 0L,
                )
            }

    fun needsPrefetch(candidate: PrefetchCandidate, held: HeldMessageWindow, prefetchedMark: String?): Boolean {
        if (prefetchedMark == candidate.latestMark) return false
        return !(held.holdsLatest(candidate) && held.count >= MINIMUM_HELD_WINDOW)
    }

    fun ledgerKey(ownerId: String, conversationId: String): String = "$ownerId|$conversationId"
}
