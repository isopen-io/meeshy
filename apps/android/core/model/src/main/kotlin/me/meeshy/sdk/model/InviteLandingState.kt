package me.meeshy.sdk.model

import java.time.Instant
import java.time.OffsetDateTime

/** Le type de la conversation d'un lien, tel que la page le nomme. */
enum class InviteGroupKind {
    DIRECT, GROUP, PUBLIC, GLOBAL, COMMUNITY, CHANNEL, OTHER;

    companion object {
        fun from(raw: String?): InviteGroupKind = when (raw?.lowercase()) {
            "direct" -> DIRECT
            "group" -> GROUP
            "public" -> PUBLIC
            "global" -> GLOBAL
            "community" -> COMMUNITY
            "channel" -> CHANNEL
            else -> OTHER
        }
    }
}

/** Qui invite et ce qu'il a écrit ; le message est absent quand il est blanc. */
data class InviteInviter(
    val firstName: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val message: String?,
)

/** La carte du groupe. [title] est `null` quand le lien n'en porte pas : la page nomme alors le type. */
data class InviteGroup(
    val title: String?,
    val kind: InviteGroupKind,
    val createdAt: Long?,
    val description: String?,
    val avatarUrl: String?,
    val bannerUrl: String?,
    val address: ShareLinkAddress,
)

/** Les tuiles de faits et la barre des langues ; un effectif nul ou inconnu n'est jamais montré. */
data class InviteFacts(
    val people: Int?,
    val languages: Int?,
    val shares: List<InviteLanguageShare>,
) {
    val isEmpty: Boolean get() = people == null && languages == null && shares.isEmpty()
}

/**
 * La projection d'un [ShareLinkInfo] vers les sections de la page d'invitation — la même avec ou
 * sans compte (seuls les choix, [InviteChoicesPanelState], dépendent de la session).
 */
data class InviteLandingState(
    val inviter: InviteInviter?,
    val group: InviteGroup?,
    val facts: InviteFacts,
    val terms: ShareLinkInvitationTerms,
) {
    companion object {
        fun from(info: ShareLinkInfo, now: Long): InviteLandingState {
            val shares = info.spokenLanguageShares
            return InviteLandingState(
                inviter = info.creator?.let { inviter(it, info.description) },
                group = info.conversation?.let { group(it, info.address) },
                facts = InviteFacts(
                    people = info.stats?.totalParticipants?.takeIf { it > 0 },
                    languages = maxOf(info.stats?.languageCount ?: 0, shares.size).takeIf { it > 0 },
                    shares = shares,
                ),
                terms = ShareLinkInvitationTerms.from(info, now),
            )
        }

        private fun inviter(creator: ShareLinkCreator, message: String?): InviteInviter {
            val first = creator.firstName?.trim().orEmpty().ifEmpty {
                creator.name.trim().split(' ').firstOrNull { it.isNotEmpty() } ?: creator.username
            }
            return InviteInviter(
                firstName = first,
                username = creator.username,
                displayName = creator.name,
                avatarUrl = creator.avatar,
                message = message?.trim()?.takeIf { it.isNotEmpty() },
            )
        }

        private fun group(conversation: ShareLinkConversation, address: ShareLinkAddress) = InviteGroup(
            title = conversation.title?.trim()?.takeIf { it.isNotEmpty() },
            kind = InviteGroupKind.from(conversation.type),
            createdAt = parseInstant(conversation.createdAt),
            description = conversation.description?.trim()?.takeIf { it.isNotEmpty() },
            avatarUrl = conversation.avatar,
            bannerUrl = conversation.banner,
            address = address,
        )

        private fun parseInstant(raw: String?): Long? {
            if (raw.isNullOrBlank()) return null
            return runCatching { OffsetDateTime.parse(raw).toInstant().toEpochMilli() }
                .recoverCatching { Instant.parse(raw).toEpochMilli() }
                .getOrNull()
        }
    }
}
