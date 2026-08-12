package me.meeshy.sdk.model

/**
 * Merges an [UpdateProfileRequest] onto a [MeeshyUser] for an instant optimistic
 * paint (ARCHITECTURE.md §4: cache-first, network-second).
 *
 * Semantics mirror the gateway `PATCH /users/me` exactly: a `null` request field
 * is **absent** — kotlinx serialization omits nulls, so the gateway never receives
 * it and leaves the persisted value untouched — while a non-null field overwrites.
 * Keeping this the single source of truth for the local edit-merge guarantees the
 * optimistic paint matches precisely what the server will persist, so a successful
 * delivery never visibly re-paints and a failure rolls back to a coherent state.
 */
object ProfileEditApply {

    fun apply(user: MeeshyUser, request: UpdateProfileRequest): MeeshyUser =
        user.copy(
            firstName = request.firstName ?: user.firstName,
            lastName = request.lastName ?: user.lastName,
            displayName = request.displayName ?: user.displayName,
            bio = request.bio ?: user.bio,
            systemLanguage = request.systemLanguage ?: user.systemLanguage,
            regionalLanguage = request.regionalLanguage ?: user.regionalLanguage,
            customDestinationLanguage = request.customDestinationLanguage
                ?: user.customDestinationLanguage,
        )
}
