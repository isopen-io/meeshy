package me.meeshy.sdk.model.profile

import kotlinx.serialization.Serializable

/**
 * `profile:updated` (#18924) — MY profile, as the row holds it after a write made on any of my devices, sent to
 * `user:<me>` alone. Mirror of `ProfileUpdatedEventData` (`@meeshy/shared/types/own-profile-sync`): an INSTANTANÉ, not a
 * delta — a lost event is repaired by the next one, and two received out of order are arbitrated by [updatedAt]
 * ([OwnProfileSync.isStale]).
 */
@Serializable
data class ProfileUpdatedEvent(
    val userId: String,
    /** `User.updatedAt` of the write, ISO 8601 — the instant `GET /me` serves. */
    val updatedAt: String,
    val profile: OwnProfileSnapshot,
)

/**
 * The fields of the snapshot. `null` means CLEARED, as on the row: the secondary language or the destination removed,
 * the display name falling back to « Prénom Nom », the picture or the banner taken off.
 */
@Serializable
data class OwnProfileSnapshot(
    val systemLanguage: String,
    val regionalLanguage: String? = null,
    val customDestinationLanguage: String? = null,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val username: String,
    val avatar: String? = null,
    val banner: String? = null,
)
