package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Per-participant send permissions — port of ParticipantPermissions (ParticipantModels.swift). */
@Serializable
data class ParticipantPermissions(
    val canSendMessages: Boolean = true,
    val canSendFiles: Boolean = true,
    val canSendImages: Boolean = true,
    val canSendVideos: Boolean = true,
    val canSendAudios: Boolean = true,
    val canSendLocations: Boolean = true,
    val canSendLinks: Boolean = true,
    /** Les familles de pieces que les termes du lien d'un invite ouvrent (#10001) ; `null` = aucune restriction. */
    val allowedAttachmentKinds: List<String>? = null,
) {
    /** Ce que CET invite peut joindre : les termes servis, tolerants (une famille inconnue n'ouvre rien). */
    val attachmentAllowance: me.meeshy.sdk.model.guest.GuestAttachmentAllowance
        get() = me.meeshy.sdk.model.guest.GuestAttachmentAllowance(
            me.meeshy.sdk.model.guest.GuestAttachmentKind.knownKinds(allowedAttachmentKinds),
        )

    companion object {
        /** Registered user: every capability granted — port of iOS `defaultUser`. */
        val defaultUser: ParticipantPermissions = ParticipantPermissions()

        /**
         * Baseline guest posture — port of iOS `ParticipantPermissions.defaultAnonymous`:
         * text messages and images only, everything else denied.
         */
        val defaultAnonymous: ParticipantPermissions = anonymous(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = true,
        )

        /**
         * Harden a set of server-advertised guest capabilities: only messages,
         * files and images are ever negotiable for an anonymous participant —
         * videos, audios, locations and links are ALWAYS denied regardless of
         * what the server sent (port of the forcing in iOS
         * `AnonymousJoinResponse.toSessionContext`).
         */
        fun anonymous(
            canSendMessages: Boolean,
            canSendFiles: Boolean,
            canSendImages: Boolean,
        ): ParticipantPermissions = ParticipantPermissions(
            canSendMessages = canSendMessages,
            canSendFiles = canSendFiles,
            canSendImages = canSendImages,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = false,
            canSendLinks = false,
        )
    }
}

/** A paginated conversation participant — port of PaginatedParticipant (ParticipantModels.swift). */
@Serializable
data class PaginatedParticipant(
    val id: String,
    val userId: String? = null,
    val username: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val conversationRole: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
    val joinedAt: String? = null,
    val isActive: Boolean? = null,
)

@Serializable
data class PaginatedParticipantsResponse(
    val success: Boolean = false,
    val data: List<PaginatedParticipant> = emptyList(),
    val pagination: PaginatedParticipantsPagination? = null,
)

@Serializable
data class PaginatedParticipantsPagination(
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    val totalCount: Int? = null,
)
