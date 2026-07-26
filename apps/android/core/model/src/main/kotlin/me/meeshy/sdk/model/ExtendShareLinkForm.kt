package me.meeshy.sdk.model

/**
 * The pure, immutable SSOT for extending a share link's expiration — the single
 * place that decides what a valid [ExtendShareLinkRequest] looks like.
 *
 * Reuses the [ShareLinkExpiration] horizon vocabulary from creation, but the extend
 * gateway route *requires* a concrete `expiresAt` (`PATCH /links/{id}/extend` rejects
 * a perpetual link), so [ShareLinkExpiration.Never] is **not** submittable here and
 * is absent from [options]. The new expiry is computed relative to an injected
 * `nowMillis` so the value stays deterministic and testable.
 */
data class ExtendShareLinkForm(
    val expiration: ShareLinkExpiration = ShareLinkExpiration.Days7,
) {
    val canSubmit: Boolean get() = expiration != ShareLinkExpiration.Never

    fun withExpiration(value: ShareLinkExpiration): ExtendShareLinkForm = copy(expiration = value)

    /** Build the wire body, or `null` when the chosen horizon is not submittable. */
    fun toRequest(nowMillis: Long): ExtendShareLinkRequest? {
        val expiresAt = expiration.expiresAtIso(nowMillis) ?: return null
        return ExtendShareLinkRequest(expiresAt = expiresAt)
    }

    companion object {
        /** The concrete horizons offered for extension — [ShareLinkExpiration.Never] excluded. */
        val options: List<ShareLinkExpiration> = listOf(
            ShareLinkExpiration.Hours24,
            ShareLinkExpiration.Days7,
            ShareLinkExpiration.Days30,
            ShareLinkExpiration.Months3,
        )
    }
}
