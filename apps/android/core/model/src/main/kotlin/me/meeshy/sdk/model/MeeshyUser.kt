package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.LanguageResolver

/**
 * User profile — port of MeeshyUser
 * (packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift).
 *
 * Implements [LanguageResolver.ContentLanguagePreferences] so the Prisme Linguistique
 * resolution works directly off a user instance.
 */
@Serializable
data class MeeshyUser(
    val id: String,
    val username: String,
    val email: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val bio: String? = null,
    val avatar: String? = null,
    val avatarThumbHash: String? = null,
    val banner: String? = null,
    val bannerThumbHash: String? = null,
    val role: String? = null,
    val isActive: Boolean? = null,
    val isAnonymous: Boolean? = null,
    val isMeeshyer: Boolean? = null,
    override val systemLanguage: String? = null,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
    override val deviceLocale: String? = null,
    val autoTranslateEnabled: Boolean? = null,
    val phoneNumber: String? = null,
    val phoneVerifiedAt: String? = null,
    val emailVerifiedAt: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
    val timezone: String? = null,
    val registrationCountry: String? = null,
    val profileCompletionRate: Int? = null,
    val blockedUserIds: List<String>? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val signalIdentityKeyPublic: String? = null,
) : LanguageResolver.ContentLanguagePreferences {

    val effectiveDisplayName: String
        get() = displayName?.takeIf { it.isNotBlank() }
            ?: listOfNotNull(firstName, lastName).joinToString(" ").takeIf { it.isNotBlank() }
            ?: username

    val resolvedRole: UserRole get() = UserRole.from(role)
}

/** Global role hierarchy (BIGBOSS highest). */
enum class UserRole(val rank: Int) {
    BIGBOSS(100),
    ADMIN(80),
    MODERATOR(60),
    AUDIT(40),
    ANALYST(30),
    USER(10);

    companion object {
        fun from(raw: String?): UserRole =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: USER
    }
}
