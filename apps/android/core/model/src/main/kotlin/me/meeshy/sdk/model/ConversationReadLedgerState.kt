package me.meeshy.sdk.model

/**
 * L'état PUR du registre de lecture (miroir de `ConversationReadLedgerState` iOS) : immuable,
 * chaque événement rend un nouvel état et l'entrée telle qu'elle était AVANT pour la conversation nommée.
 */
public data class ConversationReadLedgerState(
    private val entries: Map<String, ConversationReadEntry> = emptyMap(),
    val openConversationIds: Set<String> = emptySet(),
) {
    /** Résultat d'un événement : le nouvel état, et l'entrée d'avant (null : rien ne nommait une conversation connue). */
    public data class Applied(val state: ConversationReadLedgerState, val previous: ConversationReadEntry?)

    /** La seule conversation ouverte ; plusieurs fenêtres : null (lire [openConversationIds]). */
    public val openConversationId: String? get() = openConversationIds.singleOrNull()

    public fun state(conversationId: String): ConversationReadState? {
        val entry = entries[conversationId] ?: return null
        return ConversationReadState(
            conversationId = conversationId,
            unreadCount = entry.unreadCount,
            serverLastReadAt = entry.serverLastReadAt,
            isMuted = entry.isMuted,
            isOpen = conversationId in openConversationIds,
        )
    }

    /** Projection PAR CONVERSATION : la conversation OUVERTE se lit à zéro (rang 1), son entrée garde son reste. */
    public fun counts(): Map<String, Int> =
        entries.mapValues { (id, entry) -> if (id in openConversationIds) 0 else entry.unreadCount.coerceAtLeast(0) }

    /** Le total UNIQUE de messages ; les deux bornes sont déclarées par la surface. */
    public fun total(excludingOpen: Boolean, excludingMuted: Boolean): Int =
        entries.entries.sumOf { (id, entry) ->
            when {
                excludingOpen && id in openConversationIds -> 0
                excludingMuted && entry.isMuted -> 0
                else -> entry.unreadCount.coerceAtLeast(0)
            }
        }

    /** Le compte de CONVERSATIONS non lues (les muettes sortent toujours). */
    public fun conversationUnreadTotal(excludingOpen: Boolean): Int =
        entries.entries.count { (id, entry) ->
            !(excludingOpen && id in openConversationIds) && !entry.isMuted && entry.unreadCount > 0
        }

    public fun apply(event: ConversationReadEvent): Applied = when (event) {
        is ConversationReadEvent.LocalOpen ->
            Applied(copy(openConversationIds = setOfNotNull(event.conversationId)), null)

        is ConversationReadEvent.LocalOpenSet -> Applied(copy(openConversationIds = event.conversationIds), null)

        is ConversationReadEvent.Snapshot -> Applied(applySnapshot(event.rows, event.source), null)

        is ConversationReadEvent.Forget ->
            Applied(
                copy(entries = entries - event.conversationId, openConversationIds = openConversationIds - event.conversationId),
                entries[event.conversationId],
            )

        is ConversationReadEvent.ServerUnread -> named(event.conversationId, event)
        is ConversationReadEvent.ServerReceipt -> named(event.conversationId, event)
        is ConversationReadEvent.LocalMarkRead -> named(event.conversationId, event)
        is ConversationReadEvent.LocalMarkUnread -> named(event.conversationId, event)
    }

    private fun named(conversationId: String, event: ConversationReadEvent): Applied {
        val before = entries[conversationId] ?: ConversationReadEntry()
        val next = ConversationReadPrecedence.resolve(before, event)
        return Applied(copy(entries = entries + (conversationId to next)), before)
    }

    private fun applySnapshot(rows: List<ConversationReadRow>, source: ConversationReadSource): ConversationReadLedgerState {
        val known = rows.associate { row ->
            val tracked = entries[row.conversationId]
            val entry = (tracked ?: ConversationReadEntry()).copy(isMuted = row.isMuted)
            val seeded = if (source == ConversationReadSource.SERVER || tracked == null) {
                entry.copy(unreadCount = row.unreadCount.coerceAtLeast(0))
            } else {
                entry
            }
            row.conversationId to seeded
        }
        return copy(entries = if (source == ConversationReadSource.SERVER) known else entries + known)
    }
}
