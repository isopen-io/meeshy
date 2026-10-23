package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Ce qu'un compte a le droit de faire — la projection de la matrice unique servie par
 * `GET /admin/me/permissions` (port de `MeeshyPermissions`, iOS). Chaque drapeau vaut `false`
 * par défaut : un champ absent d'une vieille passerelle n'accorde jamais un droit.
 */
@Serializable
data class ModeratorPermissions(
    val canAccessAdmin: Boolean = false,
    val canManageUsers: Boolean = false,
    val canManageGroups: Boolean = false,
    val canManageConversations: Boolean = false,
    val canViewAnalytics: Boolean = false,
    val canModerateContent: Boolean = false,
    val canViewAuditLogs: Boolean = false,
    val canManageNotifications: Boolean = false,
    val canManageTranslations: Boolean = false,
)

/** Ma position : mon rôle, et ce qu'il m'autorise. */
@Serializable
data class MyPermissions(
    val role: String = "",
    val permissions: ModeratorPermissions = ModeratorPermissions(),
)

/**
 * L'accès à la modération, fail-closed : sans droit lu (pas de session, échec réseau, charge
 * absente) aucun contrôle de modération n'est exposé.
 */
data class ModerationAccess(val canRemoveContent: Boolean) {
    companion object {
        val None: ModerationAccess = ModerationAccess(canRemoveContent = false)

        fun from(permissions: MyPermissions?): ModerationAccess =
            if (permissions?.permissions?.canModerateContent == true) ModerationAccess(true) else None
    }
}
