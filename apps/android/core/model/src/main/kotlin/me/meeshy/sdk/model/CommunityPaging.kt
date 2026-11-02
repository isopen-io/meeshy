package me.meeshy.sdk.model

/** La fusion d'une page de liste : la première remplace, les suivantes s'ajoutent sans doublon. */
object CommunityPaging {
    fun <T> merge(existing: List<T>, incoming: List<T>, append: Boolean, idOf: (T) -> String): List<T> {
        if (!append) return incoming
        val known = existing.mapTo(HashSet()) { idOf(it) }
        return existing + incoming.filter { known.add(idOf(it)) }
    }

    /** Le terme saisi ne part au serveur qu'à partir de deux caractères (iOS `searchText.count >= 2`). */
    fun searchQuery(raw: String): String? = raw.trim().takeIf { it.length >= MIN_SEARCH_LENGTH }

    const val MIN_SEARCH_LENGTH = 2
}

/** Le choix des conversations qu'on peut rattacher à une communauté. */
object CommunityChannelPicker {
    /**
     * Les candidates : hors celles déjà dans cette communauté, et seulement celles que le lecteur
     * administre (la passerelle répond 404 sinon). Un rôle inconnu (ligne de cache ancienne) reste proposé.
     */
    fun candidates(all: List<ApiConversation>, communityId: String): List<ApiConversation> =
        all.filter { it.communityId != communityId && administers(it) }

    /** Une conversation d'une AUTRE communauté se déplace : l'écran demande confirmation. */
    fun requiresMoveConfirmation(conversation: ApiConversation, communityId: String): Boolean =
        conversation.communityId != null && conversation.communityId != communityId

    fun filter(items: List<ApiConversation>, titles: Map<String, String>, query: String): List<ApiConversation> {
        val needle = query.trim()
        if (needle.isEmpty()) return items
        return items.filter { titles[it.id].orEmpty().contains(needle, ignoreCase = true) }
    }

    private fun administers(conversation: ApiConversation): Boolean =
        conversation.currentUserRole?.let(MemberRole::from)?.hasMinimumRole(MemberRole.ADMIN) ?: true
}
