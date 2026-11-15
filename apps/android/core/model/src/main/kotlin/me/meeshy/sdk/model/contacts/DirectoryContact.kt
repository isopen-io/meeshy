package me.meeshy.sdk.model.contacts

import kotlinx.serialization.Serializable

/**
 * Une entree du repertoire telle que la passerelle la conserve (miroir de `DirectoryContact`).
 * [isOnMeeshy] choisit entre « Lui ecrire » et « Inviter ».
 */
@Serializable
data class DirectoryContact(
    val id: String,
    val contactKey: String = "",
    val displayName: String? = null,
    val phoneNumbers: List<String> = emptyList(),
    val emails: List<String> = emptyList(),
    val usernames: List<String> = emptyList(),
    val isOnMeeshy: Boolean = false,
    val matchedBy: String? = null,
    val matchedAt: String? = null,
    val lastSyncedAt: String? = null,
    val matchedUser: MatchedContactUser? = null,
) {
    /** Nom du carnet d'abord, puis l'identite du compte apparie, puis le premier identifiant. */
    val resolvedName: String
        get() {
            displayName?.takeIf { it.isNotEmpty() }?.let { return it }
            val user = matchedUser
            if (user != null) {
                user.displayName?.takeIf { it.isNotEmpty() }?.let { return it }
                val composed = listOfNotNull(user.firstName, user.lastName).filter { it.isNotEmpty() }.joinToString(" ")
                if (composed.isNotEmpty()) return composed
                return "@${user.username}"
            }
            return phoneNumbers.firstOrNull() ?: emails.firstOrNull() ?: usernames.firstOrNull() ?: ""
        }

    /** Identifiant secondaire sous le nom : le pseudo du compte, sinon le numero ou l'e-mail. */
    val subtitle: String?
        get() = matchedUser?.let { "@${it.username}" } ?: phoneNumbers.firstOrNull() ?: emails.firstOrNull()

    /** Cible d'invitation SMS d'un contact hors plateforme : le premier numero composable. */
    val invitablePhoneNumber: String? get() = phoneNumbers.firstOrNull()

    /** Vue « rapprochement » ; `null` sans compte Meeshy. */
    val asContactMatch: ContactMatch?
        get() = matchedUser?.let { ContactMatch(it, matchedBy ?: "phone", displayName) }
}
