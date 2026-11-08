package me.meeshy.sdk.model

/** L'identifiant de World Wide, la conversation globale ouverte au monde (iOS `worldWideIdentifier`). */
const val WORLD_WIDE_IDENTIFIER: String = "world"

/**
 * Ce qu'une ligne de la liste affiche de sa conversation, immuable (miroir des accesseurs de
 * `MeeshyConversation` iOS : `displayName`, `isArchived`, `isWorldWide`, `memberCountDisplay`,
 * `renderFingerprint`). [renderFingerprint] est la clé de recomposition : elle ne bouge que si le
 * RENDU change — jamais pour la présence d'un participant ni pour un message d'une autre conversation.
 */
data class ConversationRowModel(
    val id: String,
    val displayName: String,
    val isArchived: Boolean,
    val isWorldWide: Boolean,
    val memberCountDisplay: String,
    val renderFingerprint: Int,
) {
    companion object {
        fun of(conversation: ApiConversation): ConversationRowModel = ConversationRowModel(
            id = conversation.id,
            displayName = conversation.rowDisplayName(),
            isArchived = conversation.isInactive,
            isWorldWide = conversation.isWorldWide,
            memberCountDisplay = conversation.memberCountDisplay,
            renderFingerprint = conversation.renderFingerprint(),
        )
    }
}

/** Nom affiché : nom personnalisé, puis titre, puis identifiant (iOS `userState.customName ?? title ?? identifier`). */
fun ApiConversation.rowDisplayName(): String =
    resolvedPreferences?.customName?.takeIf { it.isNotBlank() }
        ?: title?.takeIf { it.isNotBlank() }
        ?: identifier?.takeIf { it.isNotBlank() }
        ?: id

/** Archivée par le serveur : la conversation n'est plus active (iOS `!isActive`). */
val ApiConversation.isInactive: Boolean get() = isActive == false

/**
 * Hash des champs qui changent le RENDU de la ligne (iOS `renderFingerprint`). La présence des
 * participants (`isOnline`, `lastActiveAt`) en est exclue : elle se lit à part, cellule par cellule.
 * Les traductions sont repliées clé et valeur, triées : une retraduction rouvre la ligne.
 */
fun ApiConversation.renderFingerprint(): Int {
    val prefs = resolvedPreferences
    return listOf(
        id,
        identifier,
        type,
        title,
        avatar,
        banner,
        lastMessage,
        lastMessageTranslations?.toSortedMap()?.entries?.map { it.key to it.value },
        lastMessageOriginalLanguage,
        unreadCount,
        viewerEngagement,
        lastReaction,
        activeCall,
        memberCount,
        memberCountCapped == true,
        isActive,
        communityId,
        tags,
        prefs?.isPinned,
        prefs?.isMuted,
        prefs?.isArchived,
        prefs?.mentionsOnly,
        prefs?.customName,
        prefs?.reaction,
        prefs?.categoryId,
        prefs?.tags,
        prefs?.appearance,
        participants.map { listOf(it.id, it.userId, it.displayName, it.username, it.avatar) },
    ).hashCode()
}
