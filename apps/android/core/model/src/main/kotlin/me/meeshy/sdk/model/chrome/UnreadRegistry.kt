package me.meeshy.sdk.model.chrome

import me.meeshy.sdk.model.sync.UnreadRules

/**
 * Le registre pur des non-lus par conversation (miroir de `NotificationCoordinator` iOS).
 *
 * Hierarchie des sources : le serveur (`conversation:unread-updated`, push) ECRASE ; l'instantane
 * du cache ne fait que SEMER les conversations jamais vues et ne regresse jamais une valeur deja
 * possedee ; une lecture locale est optimiste (zero immediat) jusqu'a ce que le serveur reparle.
 * La conversation ouverte est exclue du [total]. Immuable : chaque operation rend un nouveau registre.
 */
public data class UnreadRegistry(
    private val counts: Map<String, Int> = emptyMap(),
    private val openConversationId: String? = null,
) {
    public val isEmpty: Boolean get() = counts.isEmpty()

    public val total: Int
        get() = UnreadRules.totalConversationsUnread(counts, setOfNotNull(openConversationId))

    public fun applyServer(conversationId: String, count: Int): UnreadRegistry {
        if (conversationId.isBlank()) return this
        return copy(counts = counts + (conversationId to count.coerceAtLeast(0)))
    }

    public fun seedFromCache(snapshot: Map<String, Int>): UnreadRegistry {
        val unseen = snapshot.filterKeys { it.isNotBlank() && it !in counts }
        if (unseen.isEmpty()) return this
        return copy(counts = counts + unseen.mapValues { it.value.coerceAtLeast(0) })
    }

    public fun markReadLocally(conversationId: String): UnreadRegistry =
        copy(counts = counts + (conversationId to 0))

    public fun withOpen(conversationId: String?): UnreadRegistry = copy(openConversationId = conversationId)

    public fun cleared(): UnreadRegistry = UnreadRegistry()
}
