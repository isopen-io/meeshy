package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A community member's user — port of APICommunityUser (CommunityModels.swift). */
@Serializable
data class ApiCommunityUser(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
    /** Contour d'avatar équipé (#10945) ; absent ou illisible => aucun contour. */
    @Serializable(with = TolerantServedProfileDecorSerializer::class)
    val profileDecor: ServedProfileDecor? = null,
)

/** A community member — port of APICommunityMember (CommunityModels.swift). */
@Serializable
data class ApiCommunityMember(
    val id: String,
    val communityId: String = "",
    val userId: String = "",
    val role: String = "member",
    val joinedAt: String? = null,
    val user: ApiCommunityUser? = null,
) {
    /** Le rôle lu sans tenir compte de la casse ; une valeur inconnue vaut membre (iOS `communityRole`). */
    val communityRole: MemberRole get() = MemberRole.from(role)
}

@Serializable
data class ApiCommunityCount(
    val members: Int? = null,
    @SerialName("Conversation") val conversation: Int? = null,
)

/** API community payload — port of APICommunity (CommunityModels.swift). */
@Serializable
data class ApiCommunity(
    val id: String,
    val identifier: String = "",
    val name: String = "",
    val description: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val isPrivate: Boolean = false,
    val createdBy: String = "",
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val creator: ApiCommunityUser? = null,
    val members: List<ApiCommunityMember>? = null,
    @SerialName("_count") val count: ApiCommunityCount? = null,
    val memberCount: Int? = null,
    val conversationCount: Int? = null,
    /** Agrégat anonyme servi par `GET /communities/:id` (#18014) ; `null` = communauté trop petite ou ancien serveur. */
    val onlineMemberCount: Int? = null,
    /**
     * Le rôle que le LECTEUR tient, servi par `GET /communities/:id` (#6378) : sa ligne active, `admin`
     * pour le créateur, `null` s'il n'est pas membre. `members` n'est plus servi par le détail : c'est
     * ce champ qui décide Rejoindre ou Quitter (#16602).
     */
    val currentUserRole: String? = null,
    /** Chaque entrée attend qu'un administrateur ou un modérateur l'accepte (#19429). */
    val requiresJoinApproval: Boolean? = null,
    /** La demande d'entrée du LECTEUR : `"pending"` quand elle attend une réponse (#19868). */
    val currentUserJoinRequest: String? = null,
    /**
     * Sa dernière demande a été refusée : la date ISO à partir de laquelle il peut en refaire une
     * (#19879, lue ici pour #19949) ; `null` pour un membre, une demande en attente ou un ancien serveur.
     */
    val currentUserJoinRetryAt: String? = null,
) {
    /** Le lecteur attend la réponse à sa demande d'entrée — jamais quand il est déjà membre. */
    val hasPendingJoinRequest: Boolean get() = currentUserJoinRequest == PENDING_JOIN_REQUEST

    companion object {
        const val PENDING_JOIN_REQUEST = "pending"
    }
}

/** A community search result — port of APICommunitySearchResult (CommunityModels.swift). */
@Serializable
data class ApiCommunitySearchResult(
    val id: String,
    val name: String = "",
    val identifier: String = "",
    val description: String? = null,
    val avatar: String? = null,
    val isPrivate: Boolean = false,
    val memberCount: Int? = null,
    val conversationCount: Int? = null,
    val createdAt: String? = null,
    val creator: ApiCommunityUser? = null,
    val members: List<ApiCommunityMember>? = null,
)

@Serializable
data class CreateCommunityRequest(
    val name: String,
    val identifier: String? = null,
    val description: String? = null,
    val isPrivate: Boolean = true,
)

@Serializable
data class UpdateCommunityRequest(
    val name: String? = null,
    val identifier: String? = null,
    val description: String? = null,
    val isPrivate: Boolean? = null,
    val avatar: String? = null,
    val banner: String? = null,
)

@Serializable
data class InviteMemberRequest(
    val userId: String,
)

@Serializable
data class IdentifierAvailability(
    val available: Boolean = false,
    val identifier: String = "",
)
