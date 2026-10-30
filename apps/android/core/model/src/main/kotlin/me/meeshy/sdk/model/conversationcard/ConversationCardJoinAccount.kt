package me.meeshy.sdk.model.conversationcard

/**
 * Le compte au nom duquel « Rejoindre » agit, tel que le bouton le NOMME — miroir d'iOS
 * `ConversationCardJoinAccount` (#8726, #13684) : le nom d'affichage, sinon le pseudo. TalkBack lit
 * [spokenName] (« Rejoindre avec le compte @pseudo »).
 */
data class ConversationCardJoinAccount(val title: String, val handle: String?) {

    val spokenName: String get() = handle ?: title

    companion object {
        /** `null` ⇒ le bouton garde « Mon compte » : aucun nom à montrer, ou une session invitée, sans compte à engager. */
        fun resolve(displayName: String?, username: String?, isAnonymous: Boolean): ConversationCardJoinAccount? {
            if (isAnonymous) return null
            val handle = username?.trim()?.takeIf { it.isNotEmpty() }?.let { "@$it" }
            val title = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: handle ?: return null
            return ConversationCardJoinAccount(title = title, handle = handle)
        }
    }
}
