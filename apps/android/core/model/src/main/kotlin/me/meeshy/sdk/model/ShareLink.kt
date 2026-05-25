package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Public share link info — port of ShareLinkInfo (ShareLinkModels.swift). */
@Serializable
data class ShareLinkInfo(
    val id: String,
    val linkId: String = "",
    val name: String? = null,
    val description: String? = null,
    val expiresAt: String? = null,
    val maxUses: Int? = null,
    val currentUses: Int = 0,
    val maxConcurrentUsers: Int? = null,
    val currentConcurrentUsers: Int = 0,
    val requireAccount: Boolean = false,
    val requireNickname: Boolean = false,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
    val allowedLanguages: List<String> = emptyList(),
    val conversation: ShareLinkConversation? = null,
    val creator: ShareLinkCreator? = null,
    val stats: ShareLinkStats? = null,
)

@Serializable
data class ShareLinkConversation(
    val id: String,
    val title: String? = null,
    val description: String? = null,
    val type: String = "",
    val createdAt: String? = null,
)

@Serializable
data class ShareLinkCreator(
    val id: String,
    val username: String = "",
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
)

@Serializable
data class ShareLinkStats(
    val totalParticipants: Int = 0,
    val memberCount: Int = 0,
    val anonymousCount: Int = 0,
    val languageCount: Int = 0,
    val spokenLanguages: List<String> = emptyList(),
)

@Serializable
data class AnonymousJoinRequest(
    val firstName: String,
    val lastName: String,
    val username: String? = null,
    val email: String? = null,
    val birthday: String? = null,
    val language: String = "fr",
    val deviceFingerprint: String? = null,
)

@Serializable
data class AnonymousJoinResponse(
    val sessionToken: String = "",
    val participant: AnonymousParticipant? = null,
    val conversation: JoinedConversation? = null,
    val linkId: String = "",
    val id: String = "",
)

@Serializable
data class JoinAuthenticatedResponse(
    val conversationId: String = "",
    val message: String? = null,
)

@Serializable
data class AnonymousParticipant(
    val id: String,
    val username: String = "",
    val displayName: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val avatar: String? = null,
    val banner: String? = null,
    val language: String = "",
    val isMeeshyer: Boolean = false,
    val canSendMessages: Boolean = false,
    val canSendFiles: Boolean = false,
    val canSendImages: Boolean = false,
)

@Serializable
data class JoinedConversation(
    val id: String,
    val title: String? = null,
    val type: String = "",
    val allowViewHistory: Boolean = false,
)

@Serializable
data class CreateShareLinkRequest(
    val conversationId: String,
    val name: String? = null,
    val description: String? = null,
    val identifier: String? = null,
    val maxUses: Int? = null,
    val maxConcurrentUsers: Int? = null,
    val expiresAt: String? = null,
    val allowAnonymousMessages: Boolean = true,
    val allowAnonymousFiles: Boolean = false,
    val allowAnonymousImages: Boolean = false,
    val allowViewHistory: Boolean = false,
    val requireAccount: Boolean = false,
    val requireNickname: Boolean = false,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
)

/** A user's own share link — port of MyShareLink (ShareLinkModels.swift). */
@Serializable
data class MyShareLink(
    val id: String,
    val linkId: String = "",
    val identifier: String? = null,
    val name: String? = null,
    val isActive: Boolean = false,
    val currentUses: Int = 0,
    val maxUses: Int? = null,
    val expiresAt: String? = null,
    val createdAt: String? = null,
    val conversationTitle: String? = null,
)

@Serializable
data class MyShareLinkStats(
    val totalLinks: Int = 0,
    val activeLinks: Int = 0,
    val totalUses: Int = 0,
)
