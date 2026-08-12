package me.meeshy.sdk.model

import java.time.Duration
import java.time.Instant

/**
 * The horizon a share link stays valid for. [expiresAtIso] turns the choice into
 * the gateway's ISO-8601 `expiresAt` string relative to an injected `nowMillis`
 * (so the value is deterministic and testable), or `null` for [Never]. Faithful
 * port of iOS `CreateShareLinkView.ExpirationOption`; three months is modelled as
 * a flat 90-day horizon since link expiry is intentionally coarse.
 */
enum class ShareLinkExpiration {
    Never,
    Hours24,
    Days7,
    Days30,
    Months3,
    ;

    fun expiresAtIso(nowMillis: Long): String? {
        val horizon = when (this) {
            Never -> return null
            Hours24 -> Duration.ofHours(24)
            Days7 -> Duration.ofDays(7)
            Days30 -> Duration.ofDays(30)
            Months3 -> Duration.ofDays(90)
        }
        return Instant.ofEpochMilli(nowMillis).plus(horizon).toString()
    }
}

/**
 * The pure, immutable SSOT for creating a share link — the single place that
 * decides what a valid [CreateShareLinkRequest] looks like, and a faithful port of
 * iOS `CreateShareLinkView.create()`:
 *
 * - name / description / slug are optional; each empty one is null-omitted (never
 *   sent as `""`), and the slug is trimmed and lowercased into the URL identifier.
 * - `maxUses` only travels when [maxUsesEnabled]; otherwise the link is unlimited.
 * - the expiry is resolved through [ShareLinkExpiration] against an injected clock.
 * - a link that [requireAccount] forces every guest sub-requirement
 *   (nickname / email / birthday) off, mirroring the iOS toggle disabling — an
 *   account-gated link never also demands anonymous fields the guest can't reach.
 *
 * [canSubmit] guards on a non-blank [conversationId] so a link can never be built
 * without a conversation to point at.
 */
data class CreateShareLinkForm(
    val conversationId: String,
    val name: String = "",
    val description: String = "",
    val slug: String = "",
    val requireAccount: Boolean = false,
    val requireNickname: Boolean = true,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
    val allowAnonymousMessages: Boolean = true,
    val allowAnonymousFiles: Boolean = false,
    val allowAnonymousImages: Boolean = true,
    val allowViewHistory: Boolean = false,
    val maxUsesEnabled: Boolean = false,
    val maxUses: Int = DEFAULT_MAX_USES,
    val expiration: ShareLinkExpiration = ShareLinkExpiration.Never,
) {
    val canSubmit: Boolean get() = conversationId.isNotBlank()

    fun withName(value: String): CreateShareLinkForm = copy(name = value)

    fun withDescription(value: String): CreateShareLinkForm = copy(description = value)

    fun withSlug(value: String): CreateShareLinkForm = copy(slug = value)

    fun withRequireAccount(value: Boolean): CreateShareLinkForm = copy(requireAccount = value)

    fun withRequireNickname(value: Boolean): CreateShareLinkForm = copy(requireNickname = value)

    fun withRequireEmail(value: Boolean): CreateShareLinkForm = copy(requireEmail = value)

    fun withRequireBirthday(value: Boolean): CreateShareLinkForm = copy(requireBirthday = value)

    fun withAllowAnonymousMessages(value: Boolean): CreateShareLinkForm =
        copy(allowAnonymousMessages = value)

    fun withAllowAnonymousFiles(value: Boolean): CreateShareLinkForm =
        copy(allowAnonymousFiles = value)

    fun withAllowAnonymousImages(value: Boolean): CreateShareLinkForm =
        copy(allowAnonymousImages = value)

    fun withAllowViewHistory(value: Boolean): CreateShareLinkForm = copy(allowViewHistory = value)

    fun withMaxUsesEnabled(value: Boolean): CreateShareLinkForm = copy(maxUsesEnabled = value)

    fun withMaxUses(value: Int): CreateShareLinkForm = copy(maxUses = value)

    fun withExpiration(value: ShareLinkExpiration): CreateShareLinkForm = copy(expiration = value)

    /** Build the wire request, or `null` when the form is not submittable. */
    fun toRequest(nowMillis: Long): CreateShareLinkRequest? {
        if (!canSubmit) return null
        return CreateShareLinkRequest(
            conversationId = conversationId,
            name = name.trim().ifBlank { null },
            description = description.trim().ifBlank { null },
            identifier = slug.trim().lowercase().ifBlank { null },
            maxUses = if (maxUsesEnabled) maxUses else null,
            expiresAt = expiration.expiresAtIso(nowMillis),
            allowAnonymousMessages = allowAnonymousMessages,
            allowAnonymousFiles = allowAnonymousFiles,
            allowAnonymousImages = allowAnonymousImages,
            allowViewHistory = allowViewHistory,
            requireAccount = requireAccount,
            requireNickname = requireNickname && !requireAccount,
            requireEmail = requireEmail && !requireAccount,
            requireBirthday = requireBirthday && !requireAccount,
        )
    }

    companion object {
        const val DEFAULT_MAX_USES: Int = 100

        fun from(conversationId: String): CreateShareLinkForm =
            CreateShareLinkForm(conversationId = conversationId)
    }
}
