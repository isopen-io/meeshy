package me.meeshy.sdk.model.conversationlist

/** Le compteur de non-lus d'une conversation tel que le cache le porte. */
data class UnreadRow(val conversationId: String, val unreadCount: Int)

/**
 * La réconciliation des non-lus après une synchro COMPLÈTE (miroir de iOS
 * `NotificationCoordinator.reconcileConversationUnreads` + `ExplicitUnreadMarks`) :
 *
 * - une conversation marquée « non lue » explicitement garde au moins 1, même si le serveur
 *   (dont la mutation n'est pas encore arrivée) la dit lue ;
 * - la conversation OUVERTE à l'écran est ramenée à 0 : le lecteur la regarde ;
 * - toute autre ligne garde le compteur serveur.
 */
object UnreadReconciliation {

    /** Le compteur réconcilié de chaque ligne, dans l'ordre reçu. */
    fun reconcile(
        rows: List<UnreadRow>,
        openConversationId: String?,
        explicitlyUnread: Set<String>,
    ): List<UnreadRow> = rows.map { row ->
        row.copy(unreadCount = reconciledCount(row, openConversationId, explicitlyUnread))
    }

    /** Seulement les lignes dont le compteur change : ce qu'il faut réécrire. */
    fun corrections(
        rows: List<UnreadRow>,
        openConversationId: String?,
        explicitlyUnread: Set<String>,
    ): List<UnreadRow> = reconcile(rows, openConversationId, explicitlyUnread)
        .filterIndexed { index, row -> row.unreadCount != rows[index].unreadCount }

    /**
     * La fermeture du détail ouvert rattrape la lecture (iOS `ConversationCatchUpLaw.exitCatchesUp`),
     * sauf si le lecteur vient de marquer cette conversation non lue : la marque l'emporte.
     */
    fun exitCatchesUp(conversationId: String, explicitlyUnread: Set<String>): Boolean =
        conversationId !in explicitlyUnread

    private fun reconciledCount(row: UnreadRow, openConversationId: String?, explicitlyUnread: Set<String>): Int =
        when {
            row.conversationId in explicitlyUnread -> maxOf(row.unreadCount, 1)
            row.conversationId == openConversationId -> 0
            else -> row.unreadCount
        }
}
