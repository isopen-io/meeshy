package me.meeshy.sdk.model

/**
 * `getUserDisplayName` — displayName, else "first last", else username, else the
 * localized [fallback]. Blank parts are skipped. Mirror of iOS
 * `getUserDisplayName` (UserDisplayName.swift) and web `getUserDisplayName`.
 */
fun getUserDisplayName(
    displayName: String? = null,
    firstName: String? = null,
    lastName: String? = null,
    username: String? = null,
    fallback: String,
): String {
    displayName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val full = "${firstName?.trim().orEmpty()} ${lastName?.trim().orEmpty()}".trim()
    if (full.isNotEmpty()) return full
    username?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    return fallback
}

fun getUserDisplayName(user: MeeshyUser?, fallback: String): String =
    if (user == null) fallback
    else getUserDisplayName(user.displayName, user.firstName, user.lastName, user.username, fallback)
