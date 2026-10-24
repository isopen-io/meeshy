package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Public share link info — port of ShareLinkInfo (ShareLinkModels.swift). */
@Serializable(with = ShareLinkInfoSerializer::class)
data class ShareLinkInfo(
    val id: String,
    val linkId: String = "",
    val name: String? = null,
    val description: String? = null,
    /** Échéance en millisecondes epoch ; `null` = sans échéance (ou date illisible). */
    val expiresAt: Long? = null,
    val maxUses: Int? = null,
    val currentUses: Int = 0,
    val maxConcurrentUsers: Int? = null,
    val currentConcurrentUsers: Int = 0,
    val requireAccount: Boolean = false,
    val requireNickname: Boolean = false,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
    val allowedLanguages: List<String> = emptyList(),
    /** Droits d'un invité sans compte ; défauts du schéma quand la passerelle les omet. */
    val guestRights: ShareLinkGuestRights = ShareLinkGuestRights.SCHEMA_DEFAULTS,
    val conversation: ShareLinkConversation? = null,
    val creator: ShareLinkCreator? = null,
    val stats: ShareLinkStats? = null,
) {
    /** Adresse canonique `/chat/<linkId>` — jamais `/l/<token>` ni le slug. */
    val address: ShareLinkAddress get() = ShareLinkAddress(linkId)
}

/** L'adresse d'un lien telle qu'on la montre, copie et repartage — miroir de `ShareLinkAddress` (iOS). */
data class ShareLinkAddress(val linkId: String) {
    val path: String get() = "/chat/$linkId"

    fun absoluteString(origin: String = DEFAULT_WEB_ORIGIN): String = origin.trimEnd('/') + path

    /** La forme lisible, sans schéma : `meeshy.me/chat/<linkId>`. */
    fun displayString(origin: String = DEFAULT_WEB_ORIGIN): String =
        absoluteString(origin).substringAfter("://")

    companion object {
        const val DEFAULT_WEB_ORIGIN: String = "https://meeshy.me"
    }
}

/**
 * Ce qu'un invité SANS compte peut faire. Défauts du schéma Prisma
 * (`ConversationShareLink`) : messages vrai, images vrai, fichiers faux, historique vrai.
 */
data class ShareLinkGuestRights(
    val messages: Boolean,
    val images: Boolean,
    val files: Boolean,
    val history: Boolean,
) {
    companion object {
        val SCHEMA_DEFAULTS = ShareLinkGuestRights(messages = true, images = true, files = false, history = true)

        fun resolving(messages: Boolean?, images: Boolean?, files: Boolean?, history: Boolean?) =
            ShareLinkGuestRights(
                messages = messages ?: SCHEMA_DEFAULTS.messages,
                images = images ?: SCHEMA_DEFAULTS.images,
                files = files ?: SCHEMA_DEFAULTS.files,
                history = history ?: SCHEMA_DEFAULTS.history,
            )
    }
}

@Serializable
data class ShareLinkConversation(
    val id: String,
    val title: String? = null,
    val description: String? = null,
    val type: String = "",
    val createdAt: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
)

@Serializable
data class ShareLinkCreator(
    // L'identifiant du créateur ne part pas vers un visiteur sans compte (#10205).
    val id: String = "",
    val username: String = "",
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
) {
    /** displayName, sinon prénom + nom, sinon pseudo. */
    val name: String
        get() = displayName?.takeIf { it.isNotBlank() }
            ?: listOfNotNull(firstName, lastName).filter { it.isNotBlank() }.joinToString(" ").ifBlank { null }
            ?: username
}

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

/** Body for ending an anonymous session — port of iOS `leaveAnonymousSession`. */
@Serializable
data class LeaveAnonymousRequest(
    val sessionToken: String,
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

/**
 * Wire response of `POST /links` — the gateway wraps the created link as
 * `{ data: { linkId, conversationId, shareLink: { id, linkId, name, isActive } } }`.
 * Port of iOS `CreateShareLinkResponse`.
 */
@Serializable
data class CreateShareLinkResponse(
    val linkId: String = "",
    val conversationId: String = "",
    val shareLink: CreateShareLinkDetail = CreateShareLinkDetail(),
)

@Serializable
data class CreateShareLinkDetail(
    val id: String = "",
    val linkId: String = "",
    val name: String? = null,
    val isActive: Boolean = false,
)

/** Flattened result of a successful create — port of iOS `CreatedShareLink`. */
data class CreatedShareLink(
    val id: String,
    val linkId: String,
    val conversationId: String,
    val name: String?,
    val isActive: Boolean,
) {
    companion object {
        fun from(response: CreateShareLinkResponse): CreatedShareLink =
            CreatedShareLink(
                id = response.shareLink.id,
                linkId = response.linkId.ifBlank { response.shareLink.linkId },
                conversationId = response.conversationId,
                name = response.shareLink.name,
                isActive = response.shareLink.isActive,
            )
    }
}

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
    // Servis avec `?expand=conversation,policy` (#7797). Tous optionnels : une vieille
    // passerelle ou une ligne de cache ancienne les omet, `ShareLinkEditDraft.from`
    // résout alors les défauts du schéma.
    val description: String? = null,
    val maxConcurrentUsers: Int? = null,
    val currentConcurrentUsers: Int? = null,
    val allowAnonymousMessages: Boolean? = null,
    val allowAnonymousFiles: Boolean? = null,
    val allowAnonymousImages: Boolean? = null,
    val allowViewHistory: Boolean? = null,
    val requireAccount: Boolean? = null,
    val requireNickname: Boolean? = null,
    val requireEmail: Boolean? = null,
    val requireBirthday: Boolean? = null,
    val allowedLanguages: List<String>? = null,
    val conversation: ShareLinkConversationSummary? = null,
)

/** La conversation d'un lien (`?expand=conversation`) — miroir de `ShareLinkConversationSummary` (iOS). */
@Serializable
data class ShareLinkConversationSummary(
    val id: String = "",
    val title: String? = null,
    val type: String? = null,
    val description: String? = null,
    val avatar: String? = null,
)

@Serializable
data class MyShareLinkStats(
    val totalLinks: Int = 0,
    val activeLinks: Int = 0,
    val totalUses: Int = 0,
)

/** Body for `PATCH /links/{linkId}/toggle` — port of iOS `toggleLink`'s `ToggleBody`. */
@Serializable
data class ToggleShareLinkRequest(
    val isActive: Boolean,
)

/**
 * Body for `PATCH /links/{linkId}/extend`. The gateway requires a concrete ISO-8601
 * [expiresAt] (it rejects a perpetual extend), so this field is non-null by
 * construction — see [ExtendShareLinkForm].
 */
@Serializable
data class ExtendShareLinkRequest(
    val expiresAt: String,
)
