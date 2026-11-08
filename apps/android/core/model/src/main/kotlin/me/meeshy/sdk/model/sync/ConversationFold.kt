package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationObsoletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.conversationlist.ConversationLivePatch

/**
 * Le pli des événements de CONVERSATION dans la ligne de liste (miroir de `ConversationSyncEngine+Socket`,
 * iOS) : les champs absents d'un `conversation:updated` sont CONSERVÉS, un `deleted` / `closed` / `obsoleted`
 * désigne la ligne à retirer (avec son cache de messages), un `restored` désigne celle à relire par id, et
 * `unread-updated` pose le compteur ABSOLU du serveur. Aucune de ces décisions n'émet de réseau.
 */
public object ConversationFold {

    public fun updated(
        conversation: ApiConversation,
        event: ConversationUpdatedSocketEvent,
        readerId: String?,
        youLabel: String,
    ): ApiConversation = ConversationLivePatch.applyUpdated(conversation, event, readerId, youLabel) ?: conversation

    public fun unread(conversation: ApiConversation, event: UnreadUpdateEvent): ApiConversation =
        ConversationLivePatch.applyUnread(conversation, event.unreadCount, event.bridge) ?: conversation

    /** La conversation à retirer, `null` quand l'événement ne nomme rien d'utilisable. */
    public fun removedBy(event: ConversationDeletedSocketEvent): String? = event.conversationId.takeIf { it.isNotBlank() }

    public fun removedBy(event: ConversationClosedSocketEvent): String? = event.conversationId.takeIf { it.isNotBlank() }

    public fun removedBy(event: ConversationObsoletedSocketEvent): String? = event.conversationId.takeIf { it.isNotBlank() }

    /** La conversation à relire par id, `null` quand l'événement ne nomme rien d'utilisable. */
    public fun restoredBy(event: ConversationRestoredSocketEvent): String? = event.conversationId.takeIf { it.isNotBlank() }
}
