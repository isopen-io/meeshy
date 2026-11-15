package me.meeshy.sdk.model

import me.meeshy.sdk.model.conversationlist.ConversationLivePatch

/**
 * LA règle de fusion d'une trame temps réel dans une ligne de conversation. Miroir de
 * `ConversationStoreMergeRules` (iOS) : le patch en place de la liste, la repeinture de cache et la
 * garde de version des préférences passent toutes ici, pour que deux transports ne disent jamais deux
 * choses différentes. Chaque règle rend `null` quand la trame ne change RIEN (aucune écriture).
 */
object ConversationMergeRules {

    /** Borne de la relecture qui ramène une conversation restaurée : au-delà, le prochain rattrapage la rend. */
    const val RESTORED_READ_TIMEOUT_MILLIS: Long = 8_000L

    /** `conversation:updated` : remontée en tête, métadonnées, groupe d'aperçu tri-état. */
    fun updated(
        conversation: ApiConversation,
        event: ConversationUpdatedSocketEvent,
        readerId: String?,
        youLabel: String,
    ): ApiConversation? = ConversationLivePatch.applyUpdated(conversation, event, readerId, youLabel)

    /**
     * `user:updated` : nom composé, avatar et auteur du dernier message du contact, dans les participants
     * de la ligne (une conversation directe en lit le nom et la photo).
     */
    fun userUpdated(conversation: ApiConversation, event: UserUpdatedEvent): ApiConversation? =
        event.repainted(conversation)

    /** `user:preferences-updated` : un événement plus ancien que l'état local est ignoré (`null`). */
    fun preferences(
        conversation: ApiConversation,
        event: UserPreferencesConversationUpdatedSocketData,
    ): ApiConversation? =
        conversation.resolvedPreferences.applyRemote(event)?.let { conversation.copy(preferences = it) }

    /** `conversation:unread-updated` : le compteur absolu du serveur. */
    fun unread(conversation: ApiConversation, unreadCount: Int): ApiConversation? =
        ConversationLivePatch.applyUnread(conversation, unreadCount)

    /** Le sujet de l'événement de départ ou de bannissement est-il MOI ? Alors la ligne disparaît. */
    fun removesRowForMe(subjectUserId: String?, readerId: String?): Boolean =
        !subjectUserId.isNullOrBlank() && !readerId.isNullOrBlank() && subjectUserId == readerId
}
