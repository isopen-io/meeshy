package me.meeshy.sdk.model

/** Les onglets de statut texte de la fiche « Vu par » et leurs pastilles (les familles média restent à porter). */
object MessageViewsListing {
    val textTabs: List<MessageViewsFilter> =
        listOf(MessageViewsFilter.Sent, MessageViewsFilter.Delivered, MessageViewsFilter.Read, MessageViewsFilter.NotSeen)

    /** La pastille de l'onglet, `null` quand il n'en porte pas (Envoyé) ou que le serveur n'a pas encore répondu. */
    fun count(filter: MessageViewsFilter, data: ReadStatusData?): Int? = when (filter) {
        MessageViewsFilter.Delivered -> data?.receivedCount
        MessageViewsFilter.Read -> data?.readCount
        MessageViewsFilter.NotSeen -> data?.notSeenCount ?: data?.notSeenBy?.size
        else -> null
    }

    /** « Distribué à tous » / « Lu par tous » plutôt que le simple libellé de l'onglet. */
    fun isEveryone(count: Int, totalMembers: Int): Boolean = count >= totalMembers
}
