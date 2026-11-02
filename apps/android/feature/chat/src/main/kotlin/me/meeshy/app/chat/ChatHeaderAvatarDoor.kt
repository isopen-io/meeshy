package me.meeshy.app.chat

/**
 * Ce que le toucher de l'avatar de l'en-tête ouvre (#10300, miroir de
 * `ConversationHeaderAvatarDoor` iOS) : le profil du pair d'un direct, les détails de toute
 * autre conversation. Un visiteur sans compte n'ouvre rien de neuf : l'avatar garde la
 * bascule de l'en-tête.
 */
internal enum class ChatHeaderAvatarDoor {
    PROFILE,
    DETAILS,
    TOGGLE;

    /** L'appui long d'un direct propose un menu (profil, conversation) ; jamais pour un groupe. */
    val hasLongPressMenu: Boolean get() = this == PROFILE

    companion object {
        fun resolve(isDirect: Boolean, isGuest: Boolean, peerUserId: String?, hasConversation: Boolean): ChatHeaderAvatarDoor {
            if (isGuest || !hasConversation) return TOGGLE
            if (!isDirect) return DETAILS
            if (peerUserId.isNullOrEmpty()) return DETAILS
            return PROFILE
        }
    }
}
