package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * The profile-header identity block projected for rendering — presence, the
 * completion-ring value, the E2EE badge and the "member since" instant, all
 * resolved once here so the Compose layer stays dumb. Port of the identity /
 * details region of the iOS `ProfileSheetUser` + `UserProfileSheet` header.
 *
 * Pure data — built by [ProfileHeaderBuilder] so every derivation branch is
 * unit-testable without Compose or a ViewModel.
 */
@Immutable
data class ProfileHeaderPresentation(
    val displayName: String,
    val handle: String?,
    val bio: String?,
    val avatarUrl: String?,
    val presence: PresenceState,
    val completionPercent: Int?,
    val hasE2EE: Boolean,
    val memberSinceEpochMillis: Long?,
    val systemLanguage: String?,
    val regionalLanguage: String?,
    val country: String?,
)

object ProfileHeaderBuilder {

    /**
     * Project [user] into a [ProfileHeaderPresentation] at the caller's reference
     * clock [nowEpochMillis] (kept explicit so presence stays pure and testable).
     *
     * The completion rate is clamped into `0..100` so a malformed server value can
     * never over- or under-fill the ring; every optional text field degrades a
     * blank string to `null` so the UI shows nothing rather than an empty line.
     */
    fun build(user: MeeshyUser, nowEpochMillis: Long): ProfileHeaderPresentation =
        ProfileHeaderPresentation(
            displayName = user.effectiveDisplayName,
            handle = user.username.takeIf { it.isNotBlank() }?.let { "@$it" },
            bio = user.bio?.takeIf { it.isNotBlank() },
            avatarUrl = user.avatar?.takeIf { it.isNotBlank() },
            presence = UserPresence(isOnline = user.isOnline == true, lastActiveAt = user.lastActiveAt)
                .state(nowEpochMillis),
            completionPercent = user.profileCompletionRate?.coerceIn(0, 100),
            hasE2EE = !user.signalIdentityKeyPublic.isNullOrBlank(),
            memberSinceEpochMillis = isoToEpochMillisOrNull(user.createdAt),
            systemLanguage = user.systemLanguage?.takeIf { it.isNotBlank() },
            regionalLanguage = user.regionalLanguage?.takeIf { it.isNotBlank() },
            country = user.registrationCountry?.takeIf { it.isNotBlank() },
        )
}
