package me.meeshy.app.conversations

/** A trailing action rendered in the conversation list's [CollapsibleHeader]. */
enum class ConversationHeaderAction {
    UNLOCK_ALL,
    LOCK_SECURITY_MENU,
    CREATE_SHARE_LINK,
    NEW_CONVERSATION,
}

/**
 * Composition pure du bandeau d'actions de l'en-tête Chats — source de vérité
 * unique de « quelle action, dans quel ordre ». Les deux verrous de sécurité
 * (Android sans équivalent iOS) mènent quand ils sont actifs ; le lien de
 * partage et la nouvelle conversation (parité iOS) sont TOUJOURS présents et
 * jamais réordonnés — [ConversationHeaderActionsTest] verrouille l'ordre.
 */
fun conversationHeaderActions(
    canUnlockAll: Boolean,
    hasMasterPin: Boolean,
): List<ConversationHeaderAction> = buildList {
    if (canUnlockAll) add(ConversationHeaderAction.UNLOCK_ALL)
    if (hasMasterPin) add(ConversationHeaderAction.LOCK_SECURITY_MENU)
    add(ConversationHeaderAction.CREATE_SHARE_LINK)
    add(ConversationHeaderAction.NEW_CONVERSATION)
}

/** Gabarit des cercles de verre de l'en-tête Chats (cibles 44 dp, glyphe 24 dp semibold). */
object ConversationHeaderMetrics {
    const val ACTION_DIAMETER_DP = 44
    const val ACTION_ICON_DP = 24
}
