package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.isDirectConversationType

/** Une entrée du menu contextuel de l'avatar d'une rangée. */
enum class AvatarMenuRole {
    CONVERSATION_INFO,
    PROFILE,
    SHARE_LINK,
}

/**
 * Les entrées du menu de l'AVATAR d'une rangée — miroir de `ConversationAvatarMenu`
 * (`ThemedConversationRow.swift`). Un direct : infos de la conversation puis UN SEUL « Voir le
 * profil ». Un groupe, une publique, Global ou une diffusion : infos de la conversation, plus le
 * lien de partage quand le lecteur peut en fabriquer un ([ConversationRowMenuCapabilities.invite]),
 * jamais d'entrée profil (un avatar de groupe n'ouvre pas un profil unique).
 */
object ConversationAvatarMenu {

    private val SHAREABLE_TYPES: Set<String> = setOf("group", "public", "global", "broadcast")

    fun directRoles(): List<AvatarMenuRole> = listOf(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.PROFILE)

    fun groupRoles(canShare: Boolean): List<AvatarMenuRole> =
        if (canShare) {
            listOf(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.SHARE_LINK)
        } else {
            listOf(AvatarMenuRole.CONVERSATION_INFO)
        }

    /** Les entrées pour une rangée de ce type ; un type inconnu n'offre pas de lien. */
    fun rolesFor(conversationType: String?, canShare: Boolean): List<AvatarMenuRole> {
        if (isDirectConversationType(conversationType)) return directRoles()
        return groupRoles(canShare = canShare && conversationType in SHAREABLE_TYPES)
    }
}
