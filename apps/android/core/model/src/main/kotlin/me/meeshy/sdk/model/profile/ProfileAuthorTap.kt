package me.meeshy.sdk.model.profile

/**
 * Une personne sans identité exploitable (ni compte, ni participation, ni pseudo réel) n'ouvre aucune fiche :
 * la surface ne la rend pas cliquable. Le pseudo de repli `"?"` des fabriques n'est pas une identité.
 */
val ProfileSheetUser.isOpenable: Boolean
    get() = !userId.isNullOrBlank() ||
        !participantId.isNullOrBlank() ||
        (username.isNotBlank() && username != UNKNOWN_USERNAME)

private const val UNKNOWN_USERNAME = "?"

/**
 * L'auteur d'un contenu social (post, commentaire, story, vue) tel que la surface le connaît.
 * `null` quand rien ne l'identifie : l'appelant ne pose alors aucune zone tactile.
 * Identité = `userId ?: participantId ?: username` ([ProfileSheetUser.id]).
 */
fun ProfileSheetUser.Companion.ofAuthor(
    userId: String?,
    username: String? = null,
    displayName: String? = null,
    avatarUrl: String? = null,
    accentColor: String = "",
): ProfileSheetUser? = ProfileSheetUser(
    userId = userId?.takeIf { it.isNotBlank() },
    username = username?.takeIf { it.isNotBlank() } ?: displayName?.takeIf { it.isNotBlank() } ?: UNKNOWN_USERNAME,
    displayName = displayName?.takeIf { it.isNotBlank() },
    avatarUrl = avatarUrl?.takeIf { it.isNotBlank() },
    accentColor = accentColor,
).takeIf { it.isOpenable }

/**
 * Une mention `@pseudo` : le compte quand le texte en connaît l'identifiant, sinon la fiche s'ouvre par le pseudo.
 * Un pseudo vide n'ouvre rien.
 */
fun ProfileSheetUser.Companion.ofMention(username: String, knownUserId: String? = null): ProfileSheetUser? {
    val handle = username.trim().removePrefix("@")
    val accountId = knownUserId?.takeIf { it.isNotBlank() }
    if (accountId != null) return ProfileSheetUser(userId = accountId, username = handle.ifEmpty { accountId })
    if (handle.isEmpty()) return null
    return ProfileSheetUser.from(handle)
}
