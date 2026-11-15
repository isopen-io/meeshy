package me.meeshy.sdk.model.share

/** Une communauté où l'on peut écrire — elle se déplie en ses canaux (D11). Miroir de `ShareCommunity` (iOS). */
data class ShareCommunity(val id: String, val name: String, val avatarUrl: String?)

/** Ce que la recherche serveur rend, fusionné par l'écran. Miroir de `ShareSearchResults` (iOS). */
data class ShareSearchResults(
    val people: List<ShareRecipient> = emptyList(),
    val conversations: List<ShareRecipient> = emptyList(),
    val communities: List<ShareCommunity> = emptyList(),
) {
    companion object {
        val EMPTY = ShareSearchResults()
    }
}

/** Ce que la feuille affiche : les récents avant toute frappe, puis conversations, personnes, communautés. */
data class ShareDirectoryView(
    val recents: List<ShareRecipient>,
    val conversations: List<ShareRecipient>,
    val people: List<ShareRecipient>,
    val communities: List<ShareCommunity>,
) {
    val isEmpty: Boolean get() = conversations.isEmpty() && people.isEmpty() && communities.isEmpty()
}

/**
 * **L'annuaire des destinataires, côté loi** (#14774) — fusion, dédoublonnage, filtre local, jonction
 * avec la réponse serveur et plafond de sélection. Pur et sans état ; miroir de la logique de
 * `ShareSheetViewModel` (iOS : `visibleConversations`, `visiblePeople`, `visibleCommunities`,
 * `showsSkeleton`) et de `ShareRecipientMerge.isReachableConversation`.
 *
 * Un ami sans directe est une Personne ; avec directe il n'apparaît qu'une fois (la conversation).
 */
object ShareRecipientDirectory {

    fun view(
        conversations: List<ShareRecipient>,
        people: List<ShareRecipient>,
        communities: List<ShareCommunity>,
        query: String,
        found: ShareSearchResults?,
        sourceConversationId: String?,
    ): ShareDirectoryView {
        val reachable = reachable(conversations, sourceConversationId)
        val typing = query.isNotBlank()
        val localConversations = ShareRecipientMerge.matching(reachable, query)
        val visibleConversations = if (found == null) {
            localConversations
        } else {
            ShareRecipientMerge.merge(localConversations + reachable(found.conversations, sourceConversationId), emptyList())
        }
        val visiblePeople = ShareRecipientMerge
            .merge(reachable, ShareRecipientMerge.matching(people, query) + found?.people.orEmpty())
            .filter { it.kind == ShareRecipient.Kind.PERSON }
        return ShareDirectoryView(
            recents = if (typing) emptyList() else reachable.take(ShareSheetState.RECENTS_COUNT),
            conversations = visibleConversations,
            people = visiblePeople,
            communities = communities(communities, found, query),
        )
    }

    private fun communities(local: List<ShareCommunity>, found: ShareSearchResults?, query: String): List<ShareCommunity> {
        val needle = query.trim()
        val matching = if (needle.isEmpty()) {
            local
        } else {
            val folded = ShareRecipientMerge.fold(needle)
            local.filter { ShareRecipientMerge.fold(it.name).contains(folded) }
        }
        return (matching + found?.communities.orEmpty()).distinctBy { it.id }
    }

    /** La conversation d'où le contenu vient n'est jamais proposée ; une personne n'a pas de conversation. */
    fun reachable(recipients: List<ShareRecipient>, sourceConversationId: String?): List<ShareRecipient> =
        recipients.filter { it.conversationId == null || it.conversationId != sourceConversationId }

    /**
     * Une conversation trouvée par la recherche n'est un destinataire que si l'on peut y ÉCRIRE, donc
     * si l'on en est membre. [isMember] est le drapeau SERVEUR et fait foi ; absent (passerelle
     * antérieure), seuls les salons `public`/`global` exigent de lire les participants.
     */
    fun isReachableConversation(type: String, participantUserIds: List<String>, currentUserId: String, isMember: Boolean?): Boolean {
        if (isMember != null) return isMember
        if (type.lowercase() !in OPEN_ROOMS) return true
        return currentUserId.isNotEmpty() && currentUserId in participantUserIds
    }

    /** Cocher ajoute (jusqu'au plafond), recocher retire — le onzième est refusé en silence. */
    fun toggled(selection: List<ShareRecipient>, recipient: ShareRecipient, limit: Int = ShareLimits.MAX_RECIPIENTS): List<ShareRecipient> = when {
        selection.any { it.id == recipient.id } -> selection.filterNot { it.id == recipient.id }
        selection.size >= limit -> selection
        else -> selection + recipient
    }

    fun canSelectMore(selection: List<ShareRecipient>, limit: Int = ShareLimits.MAX_RECIPIENTS): Boolean = selection.size < limit

    /** Premier lancement, cache vide : le seul cas où un squelette est permis. */
    fun showsSkeleton(conversations: List<ShareRecipient>, people: List<ShareRecipient>, loading: Boolean): Boolean =
        conversations.isEmpty() && people.isEmpty() && loading

    /** La première page fraîche passe devant le cache ; un id n'est jamais répété (le frais l'emporte). */
    fun revalidated(cached: List<ShareRecipient>, fresh: List<ShareRecipient>): List<ShareRecipient> =
        ShareRecipientMerge.merge(fresh + cached, emptyList())

    private val OPEN_ROOMS = setOf("public", "global")
}
