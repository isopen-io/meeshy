package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileShareLink

/**
 * A user's profile projected for the share sheet: the display name, the `@handle`
 * and the two canonical links (web Universal Link for the QR / copy / external
 * share, and the `meeshy://` scheme for in-app hand-off).
 *
 * Pure data — built by [ProfileShareBuilder] so the derivation stays unit-testable
 * without Compose. The links come from [ProfileShareLink] (the deep-link SSOT) so
 * the QR image, the copied link and the shared text can never disagree.
 */
@Immutable
data class ProfileSharePresentation(
    val displayName: String,
    val handle: String,
    val webLink: String,
    val appLink: String,
)

object ProfileShareBuilder {

    /**
     * Project [user] into a [ProfileSharePresentation], or `null` when the user
     * has no shareable handle (blank username) — nothing to encode in a QR or a
     * link, so the share affordance stays hidden rather than emitting a dead URL.
     */
    fun build(user: MeeshyUser): ProfileSharePresentation? {
        val canonical = ProfileShareLink.canonicalUsername(user.username) ?: return null
        val web = ProfileShareLink.webLink(user.username) ?: return null
        val app = ProfileShareLink.appLink(user.username) ?: return null
        return ProfileSharePresentation(
            displayName = user.effectiveDisplayName,
            handle = "@$canonical",
            webLink = web,
            appLink = app,
        )
    }
}
