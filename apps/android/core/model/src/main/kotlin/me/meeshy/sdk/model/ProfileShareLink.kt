package me.meeshy.sdk.model

/**
 * Canonical, cross-platform links to a user profile — the single source of truth
 * behind "share profile", "copy link", and the profile QR code.
 *
 * The link shape mirrors the iOS `DeepLinkParser` contract
 * (apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift):
 *  - web Universal Link: `https://meeshy.me/u/{username}`
 *  - custom scheme:      `meeshy://u/{username}`
 *
 * `u` is the canonical user segment claimed by the iOS AASA file, so a link or QR
 * produced here resolves in every Meeshy client. The username is percent-encoded
 * as an RFC 3986 path segment so an unusual handle can never produce a malformed
 * URL.
 */
object ProfileShareLink {

    const val WEB_HOST: String = "meeshy.me"
    const val APP_SCHEME: String = "meeshy"
    const val USER_SEGMENT: String = "u"

    /**
     * The username reduced to its canonical form: trimmed, with a display-only
     * leading `@` removed. Returns `null` when nothing shareable remains (blank
     * input, or a lone `@`) — a profile with no handle cannot be shared.
     */
    fun canonicalUsername(username: String): String? =
        username.trim().removePrefix("@").trim().takeIf { it.isNotBlank() }

    /** `https://meeshy.me/u/{username}`, or `null` when the handle is blank. */
    fun webLink(username: String): String? {
        val handle = canonicalUsername(username) ?: return null
        return "https://$WEB_HOST/$USER_SEGMENT/${encodePathSegment(handle)}"
    }

    /** `meeshy://u/{username}`, or `null` when the handle is blank. */
    fun appLink(username: String): String? {
        val handle = canonicalUsername(username) ?: return null
        return "$APP_SCHEME://$USER_SEGMENT/${encodePathSegment(handle)}"
    }

    private const val UNRESERVED: String =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

    private fun encodePathSegment(segment: String): String =
        buildString {
            segment.toByteArray(Charsets.UTF_8).forEach { byte ->
                val code = byte.toInt() and 0xFF
                val char = code.toChar()
                if (char in UNRESERVED) {
                    append(char)
                } else {
                    append('%')
                    append("%02X".format(code))
                }
            }
        }
}
