package me.meeshy.sdk.model

/**
 * Le visage d'une bannière in-app (#12569) — miroir d'iOS `toastAvatarURL` / `toastAvatarName`
 * (`SocketNotificationEvent+Toast.swift`), partagé par la bannière et le toast : la photo de
 * l'ACTEUR ; à défaut, dans un GROUPE, celle du groupe, et ce sont alors les initiales du groupe
 * qui tiennent sa place pendant le chargement, pour qu'un seul visage occupe le cercle.
 *
 * Un direct ne prête jamais la photo de sa conversation : ce champ y est un artefact legacy qui
 * peut montrer n'importe qui, le lecteur compris (même règle que [displayedAvatar]).
 */
public data class NotificationBannerAvatar(val name: String, val url: String?) {
    public companion object {
        /**
         * @param actorName le nom que la bannière donne déjà à l'acteur.
         * @param isDirect la conversation est un fil à deux ([isDirectConversationType]).
         * @param groupName le nom du groupe que l'appareil connaît (renommage local), sinon son titre servi.
         */
        public fun of(
            notification: ApiNotification,
            actorName: String,
            isDirect: Boolean,
            groupName: String? = notification.context?.conversationTitle,
        ): NotificationBannerAvatar {
            notification.actor?.avatar.served()?.let { return NotificationBannerAvatar(name = actorName, url = it) }
            val group = notification.context?.conversationAvatar.served()?.takeUnless { isDirect }
                ?: return NotificationBannerAvatar(name = actorName, url = null)
            return NotificationBannerAvatar(name = groupName.served() ?: actorName, url = group)
        }

        private fun String?.served(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
    }
}
