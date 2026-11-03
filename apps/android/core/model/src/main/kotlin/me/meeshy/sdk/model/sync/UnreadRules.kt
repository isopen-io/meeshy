package me.meeshy.sdk.model.sync

/**
 * Les règles pures du non-lu autour de la conversation OUVERTE (miroir de `OpenConversationLedger` iOS) :
 * forçage à zéro, reste après lecture partielle, une conversation ouverte dans deux fenêtres ne se rend
 * au décompte qu'à la DERNIÈRE fermeture, total des AUTRES conversations.
 */
public data class OpenConversations(
    private val openCounts: Map<String, Int> = emptyMap(),
    private val openOrder: List<String> = emptyList(),
    private val toRestoreOnClose: Map<String, Int> = emptyMap(),
) {
    /** Résultat d'une fermeture : [closed] vrai à la dernière fenêtre, [restore] le décompte à rendre. */
    public data class Closing(val next: OpenConversations, val closed: Boolean, val restore: Int?)

    public val ids: Set<String> get() = openCounts.keys

    /** La conversation affichée la plus récemment ouverte. */
    public val current: String? get() = openOrder.lastOrNull()

    public fun isOpen(conversationId: String): Boolean = conversationId in openCounts

    /** Ouvre une fenêtre sur [conversationId] ; [currentUnread] est le décompte à rendre à la fermeture. */
    public fun open(conversationId: String, currentUnread: Int): OpenConversations {
        val count = openCounts[conversationId] ?: 0
        val order = openOrder.filter { it != conversationId } + conversationId
        val restore = if (count == 0) toRestoreOnClose + (conversationId to currentUnread.coerceAtLeast(0)) else toRestoreOnClose
        return copy(openCounts = openCounts + (conversationId to count + 1), openOrder = order, toRestoreOnClose = restore)
    }

    public fun close(conversationId: String): Closing {
        val count = openCounts[conversationId] ?: return Closing(this, closed = false, restore = null)
        if (count > 1) return Closing(copy(openCounts = openCounts + (conversationId to count - 1)), closed = false, restore = null)
        return Closing(
            next = copy(
                openCounts = openCounts - conversationId,
                openOrder = openOrder.filter { it != conversationId },
                toRestoreOnClose = toRestoreOnClose - conversationId,
            ),
            closed = true,
            restore = toRestoreOnClose[conversationId],
        )
    }

    /** Après une lecture partielle : ce qui reste réellement à lire, rendu à la fermeture. */
    public fun noteUnreadRemaining(conversationId: String, remaining: Int): OpenConversations =
        if (conversationId !in openCounts) this
        else copy(toRestoreOnClose = toRestoreOnClose + (conversationId to remaining.coerceAtLeast(0)))
}

public object UnreadRules {

    /** Le décompte AFFICHÉ : jamais de compteur non nul sur la conversation ouverte, jamais négatif. */
    public fun displayed(count: Int, isOpen: Boolean): Int = if (isOpen) 0 else count.coerceAtLeast(0)

    /** Somme des non-lus des AUTRES conversations que les [open] (clamp à zéro) : badge de retour et menus. */
    public fun totalConversationsUnread(counts: Map<String, Int>, open: Set<String>): Int =
        counts.entries.sumOf { (id, count) -> if (id in open) 0 else count.coerceAtLeast(0) }
}
