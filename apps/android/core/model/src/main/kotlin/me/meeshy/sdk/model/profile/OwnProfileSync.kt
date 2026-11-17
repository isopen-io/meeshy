package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** #18924 — what a `profile:updated` snapshot changes on this device. */
object OwnProfileSync {

    /**
     * Mirror of `ownProfileSnapshotIsStale`: a snapshot is stale when its instant is STRICTLY before the one of the
     * identity held. Only what is PROVED older is set aside — nothing known, or an instant that does not read, and the
     * snapshot applies; the same instant applies too (the echo of my own `PATCH`).
     */
    fun isStale(knownUpdatedAt: String?, incomingUpdatedAt: String): Boolean {
        val known = isoToEpochMillisOrNull(knownUpdatedAt) ?: return false
        val incoming = isoToEpochMillisOrNull(incomingUpdatedAt) ?: return false
        return incoming < known
    }

    /** The signed-in identity carrying [event]'s snapshot; `null` for another account's event or a stale one. */
    fun applied(user: MeeshyUser, event: ProfileUpdatedEvent): MeeshyUser? {
        if (user.id != event.userId || isStale(user.updatedAt, event.updatedAt)) return null
        val profile = event.profile
        return user.copy(
            systemLanguage = profile.systemLanguage,
            regionalLanguage = profile.regionalLanguage,
            customDestinationLanguage = profile.customDestinationLanguage,
            displayName = profile.displayName,
            firstName = profile.firstName,
            lastName = profile.lastName,
            username = profile.username,
            avatar = profile.avatar,
            banner = profile.banner,
            updatedAt = event.updatedAt,
        )
    }

    /**
     * What my other caches (the rosters I am in, the messages I sent, the conversations naming me) need of the snapshot,
     * in the shape of `user:updated` — which goes to my PARTNERS and excludes me, so my own devices never receive it.
     */
    fun asUserUpdated(event: ProfileUpdatedEvent): UserUpdatedEvent {
        val profile = event.profile
        return UserUpdatedEvent(
            userId = event.userId,
            displayName = profile.displayName,
            firstName = profile.firstName,
            lastName = profile.lastName,
            username = profile.username,
            hasNameGroup = true,
            avatar = OptionalMediaChange.Replaced(profile.avatar),
            banner = OptionalMediaChange.Replaced(profile.banner),
        )
    }
}
