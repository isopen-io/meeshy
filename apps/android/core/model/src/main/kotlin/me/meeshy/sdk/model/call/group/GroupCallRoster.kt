package me.meeshy.sdk.model.call.group

import me.meeshy.sdk.model.call.CallRules

/** État de la connexion vers UN membre d'un appel de groupe — iOS `GroupCallLinkState`. */
enum class GroupCallLinkState { Connecting, Connected, Reconnecting }

/** Ce qu'un membre peut basculer : `call:media-toggled.mediaType` — iOS `GroupCallMediaKind`. */
enum class GroupCallMediaKind(val wire: String) {
    Audio("audio"),
    Video("video"),
    Screen("screen"),
    ;

    companion object {
        fun fromWire(raw: String?): GroupCallMediaKind? = entries.firstOrNull { it.wire == raw }
    }
}

/** Un membre DISTANT d'un appel de groupe, tel que la grille le dessine — iOS `GroupCallMember`. */
data class GroupCallMember(
    val userId: String,
    val displayName: String = "",
    val avatarUrl: String? = null,
    val isPrimary: Boolean = false,
    val isMicMuted: Boolean = false,
    val isCameraOn: Boolean = false,
    val isScreenSharing: Boolean = false,
    val link: GroupCallLinkState = GroupCallLinkState.Connecting,
)

/** Une arrivée annoncée par `call:participant-joined`, ou découverte par l'offre d'un membre déjà là. */
data class GroupCallArrival(
    val userId: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val isAudioEnabled: Boolean? = null,
    val isVideoEnabled: Boolean? = null,
)

/**
 * Les membres DISTANTS d'un appel de groupe, dans l'ordre d'arrivée (la grille ne se réagence pas quand
 * quelqu'un parle). Valeur immuable, miroir de iOS `GroupCallRoster` : chaque changement rend un nouveau
 * registre. Le plafond est celui de la passerelle ([CallRules.MAX_PARTICIPANTS], moi compris) : un maillage
 * sans SFU ne tient pas au-delà.
 */
data class GroupCallRoster(
    val localUserId: String,
    val capacity: Int = CallRules.MAX_PARTICIPANTS,
    val members: List<GroupCallMember> = emptyList(),
) {
    /** Participants de l'appel, moi compris. */
    val participantCount: Int get() = members.size + 1

    val isFull: Boolean get() = participantCount >= capacity

    fun member(userId: String): GroupCallMember? = members.firstOrNull { it.userId == userId }

    operator fun contains(userId: String): Boolean = member(userId) != null

    /** Admet (ou enrichit) un membre. Moi-même, un identifiant vide ou un arrivant au-delà du plafond ne sont jamais admis. */
    fun admitting(arrival: GroupCallArrival, isPrimary: Boolean = false): GroupCallRoster {
        if (arrival.userId.isBlank() || arrival.userId == localUserId) return this
        val existing = member(arrival.userId)
        if (existing != null) {
            return replacing(
                existing.copy(
                    displayName = arrival.displayName?.takeIf { it.isNotBlank() } ?: existing.displayName,
                    avatarUrl = arrival.avatarUrl ?: existing.avatarUrl,
                    isPrimary = isPrimary || existing.isPrimary,
                    isMicMuted = arrival.isAudioEnabled?.let { !it } ?: existing.isMicMuted,
                    isCameraOn = arrival.isVideoEnabled ?: existing.isCameraOn,
                ),
            )
        }
        if (isFull) return this
        val member = GroupCallMember(
            userId = arrival.userId,
            displayName = arrival.displayName.orEmpty(),
            avatarUrl = arrival.avatarUrl,
            isPrimary = isPrimary,
            isMicMuted = arrival.isAudioEnabled?.let { !it } ?: false,
            isCameraOn = arrival.isVideoEnabled ?: false,
        )
        return copy(members = members + member)
    }

    fun removing(userId: String): GroupCallRoster = copy(members = members.filterNot { it.userId == userId })

    fun applying(kind: GroupCallMediaKind, enabled: Boolean, userId: String): GroupCallRoster {
        val existing = member(userId) ?: return this
        return replacing(
            when (kind) {
                GroupCallMediaKind.Audio -> existing.copy(isMicMuted = !enabled)
                GroupCallMediaKind.Video -> existing.copy(isCameraOn = enabled)
                GroupCallMediaKind.Screen -> existing.copy(isScreenSharing = enabled)
            },
        )
    }

    fun updatingLink(state: GroupCallLinkState, userId: String): GroupCallRoster {
        val existing = member(userId) ?: return this
        return replacing(existing.copy(link = state))
    }

    private fun replacing(member: GroupCallMember): GroupCallRoster =
        copy(members = members.map { if (it.userId == member.userId) member else it })
}
