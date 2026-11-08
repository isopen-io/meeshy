package me.meeshy.sdk.model.link

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * **Ce que les widgets et le raccourci « Conversations récentes » ouvrent** (iOS `ConversationListEntry`, #7811).
 * `meeshy://conversations/recent` et `…/unread` désignent une conversation que seul le client sait élire : les
 * deux élections sont ici, pures, et la racine ne fait que les appliquer.
 */
object ConversationListEntry {
    /** « Non lus » : la liste sur le MÊME filtre que la puce du même nom. */
    val unreadFilter: ConversationFilter = ConversationFilter.UNREAD

    /**
     * « Récente » : la conversation au dernier message le plus récent. Jamais une archivée par soi, supprimée
     * pour soi ou fermée (`isActive == false`) : la liste les masque, le raccourci ne les ressort pas.
     */
    fun recentConversationId(conversations: List<ApiConversation>): String? =
        conversations
            .filter(::isListed)
            .maxByOrNull { lastActivityMillis(it) }
            ?.id

    private fun isListed(conversation: ApiConversation): Boolean {
        val preferences = conversation.resolvedPreferences
        return preferences?.isArchived != true &&
            preferences?.deletedForUserAt == null &&
            conversation.isActive != false
    }

    private fun lastActivityMillis(conversation: ApiConversation): Long =
        isoToEpochMillisOrNull(conversation.lastMessage?.createdAt)
            ?: isoToEpochMillisOrNull(conversation.updatedAt)
            ?: isoToEpochMillisOrNull(conversation.createdAt)
            ?: Long.MIN_VALUE
}
