package me.meeshy.sdk.model.conversationinfo

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Le genre d'un fil tel que la fiche le dit (iOS `conversation.type.displayName`, icône
 * `conversationTypeIcon`). Un type inconnu se lit comme un groupe : la fiche n'est jamais muette.
 */
enum class ConversationTypeKind(val hasHeroBanner: Boolean) {
    DIRECT(hasHeroBanner = false),
    GROUP(hasHeroBanner = true),
    PUBLIC(hasHeroBanner = true),
    GLOBAL(hasHeroBanner = true),
    COMMUNITY(hasHeroBanner = true),
    CHANNEL(hasHeroBanner = true),
    BROADCAST(hasHeroBanner = true),
    BOT(hasHeroBanner = true),
    ;

    companion object {
        fun of(type: String?): ConversationTypeKind = when (type?.lowercase()) {
            "direct", "dm" -> DIRECT
            "public" -> PUBLIC
            "global" -> GLOBAL
            "community" -> COMMUNITY
            "channel" -> CHANNEL
            "broadcast" -> BROADCAST
            "bot" -> BOT
            else -> GROUP
        }
    }
}

/**
 * Le héros de la fiche Conversation (iOS `ConversationInfoSheet.conversationHeader`) : le genre et
 * l'effectif (« 199+ » quand la passerelle plafonne), la date de création, l'indicateur
 * « Notifications désactivées » et la bannière des fils qui en ont une. Projection pure de la ligne.
 */
data class ConversationInfoHero(
    val kind: ConversationTypeKind,
    val memberCountLabel: String?,
    val createdAtEpochMillis: Long?,
    val muted: Boolean,
    val bannerUrl: String?,
) {
    companion object {
        fun of(conversation: ApiConversation): ConversationInfoHero {
            val kind = ConversationTypeKind.of(conversation.type)
            val count = conversation.memberCount
            return ConversationInfoHero(
                kind = kind,
                memberCountLabel = count.takeIf { it > 0 }?.let { if (conversation.memberCountCapped == true) "$it+" else "$it" },
                createdAtEpochMillis = isoToEpochMillisOrNull(conversation.createdAt),
                muted = conversation.resolvedPreferences?.isMuted == true,
                bannerUrl = conversation.banner?.takeIf { kind.hasHeroBanner && it.isNotBlank() },
            )
        }
    }
}
