package me.meeshy.sdk.model

/**
 * Merges an [UpdateProfileRequest] onto a [MeeshyUser] for an instant optimistic
 * paint (ARCHITECTURE.md §4: cache-first, network-second).
 *
 * Semantics mirror the gateway `PATCH /users/me` exactly: a `null` request field
 * is **absent** — kotlinx serialization omits nulls, so the gateway never receives
 * it and leaves the persisted value untouched. A non-empty field overwrites. An
 * EMPTY string clears the three fields the gateway lets a user clear — the bio,
 * the regional language and the custom destination language (iOS
 * `ProfileView.changedOrNil`) — and is ignored on the others, which have no valid
 * empty form. Keeping this the single source of truth for the local edit-merge
 * guarantees the optimistic paint matches precisely what the server will persist.
 */
object ProfileEditApply {

    fun apply(user: MeeshyUser, request: UpdateProfileRequest): MeeshyUser =
        user.copy(
            firstName = required(request.firstName, user.firstName),
            lastName = required(request.lastName, user.lastName),
            displayName = required(request.displayName, user.displayName),
            bio = clearable(request.bio, user.bio),
            systemLanguage = required(request.systemLanguage, user.systemLanguage),
            regionalLanguage = clearable(request.regionalLanguage, user.regionalLanguage),
            customDestinationLanguage = clearable(request.customDestinationLanguage, user.customDestinationLanguage),
        )

    private fun required(requested: String?, current: String?): String? =
        requested?.takeIf { it.isNotEmpty() } ?: current

    private fun clearable(requested: String?, current: String?): String? = when {
        requested == null -> current
        requested.isEmpty() -> null
        else -> requested
    }
}
