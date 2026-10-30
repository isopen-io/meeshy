package me.meeshy.sdk.model.call.group

/** La grille d'un appel de groupe : colonnes × rangées — iOS `GroupCallGridLayout`. */
data class GroupCallGridLayout(val columns: Int, val rows: Int) {
    val capacity: Int get() = columns * rows

    companion object {
        fun layout(tileCount: Int, isLandscape: Boolean): GroupCallGridLayout = when (maxOf(1, tileCount)) {
            1 -> GroupCallGridLayout(1, 1)
            2 -> if (isLandscape) GroupCallGridLayout(2, 1) else GroupCallGridLayout(1, 2)
            3, 4 -> GroupCallGridLayout(2, 2)
            else -> if (isLandscape) GroupCallGridLayout(3, 2) else GroupCallGridLayout(2, 3)
        }
    }
}

/** Une vignette de la grille d'un appel de groupe — iOS `GroupCallStageTile`. */
data class GroupCallStageTile(
    val id: String,
    /** L'identifiant de la PERSONNE (le mien pour ma vignette) : sa couleur. */
    val colorKey: String,
    val displayName: String,
    val avatarUrl: String?,
    val isLocal: Boolean,
    val isMicMuted: Boolean,
    val showsVideo: Boolean,
    val isScreenSharing: Boolean,
    val isReconnecting: Boolean,
    /** Le membre parle ([ActiveSpeakerDetector]) : son liseré s'épaissit. Jamais ma vignette, comme iOS. */
    val isSpeaking: Boolean = false,
)

/** Ce que la scène d'un appel de groupe dessine — iOS `GroupCallStage`. */
object GroupCallStageLaw {
    const val LOCAL_TILE_ID: String = "group-call-local"

    /**
     * La grille ne remplace l'écran du duo qu'à partir de DEUX membres distants : avec le seul pair principal,
     * l'écran du duo est déjà la bonne disposition. Un membre tenu par le maillage (le principal parti) n'a que
     * la grille pour être vu.
     */
    fun isShown(isMeshActive: Boolean, roster: GroupCallRoster): Boolean =
        isMeshActive && (roster.members.size >= 2 || roster.members.any { !it.isPrimary })

    /** Moi d'abord, puis les membres dans l'ordre d'arrivée : la grille ne se réagence jamais. */
    fun tiles(
        roster: GroupCallRoster,
        localName: String,
        speakingUserIds: Set<String> = emptySet(),
        isLocalMicMuted: Boolean,
        isLocalVideoEnabled: Boolean,
        isPrimaryVideoActive: Boolean,
    ): List<GroupCallStageTile> {
        val local = GroupCallStageTile(
            id = LOCAL_TILE_ID,
            colorKey = roster.localUserId,
            displayName = localName,
            avatarUrl = null,
            isLocal = true,
            isMicMuted = isLocalMicMuted,
            showsVideo = isLocalVideoEnabled,
            isScreenSharing = false,
            isReconnecting = false,
        )
        val remote = roster.members.map { member ->
            GroupCallStageTile(
                id = member.userId,
                colorKey = member.userId,
                displayName = member.displayName,
                avatarUrl = member.avatarUrl,
                isLocal = false,
                isMicMuted = member.isMicMuted,
                showsVideo = if (member.isPrimary) isPrimaryVideoActive else member.isCameraOn || member.isScreenSharing,
                isScreenSharing = member.isScreenSharing,
                isReconnecting = member.link == GroupCallLinkState.Reconnecting,
                isSpeaking = member.userId in speakingUserIds,
            )
        }
        return listOf(local) + remote
    }
}

/**
 * Les amis qu'on peut encore faire sonner dans l'appel — iOS `CallInviteCandidates` : ni moi, ni ceux déjà dans
 * l'appel (principal et maillage), ni ceux qui sonnent déjà. Et plus personne quand l'appel est plein : la
 * passerelle refuserait (`CallRules.MAX_PARTICIPANTS`, moi compris), et un choix qui ne peut pas aboutir ne
 * s'offre pas.
 */
object CallInviteCandidates {
    fun excludedIds(
        localUserId: String?,
        primaryUserId: String?,
        roster: GroupCallRoster,
        ringingUserIds: Set<String>,
    ): Set<String> = buildSet {
        localUserId?.takeIf { it.isNotBlank() }?.let(::add)
        primaryUserId?.takeIf { it.isNotBlank() }?.let(::add)
        roster.members.forEach { add(it.userId) }
        addAll(ringingUserIds)
    }

    fun <T> filter(friends: List<T>, excluding: Set<String>, idOf: (T) -> String): List<T> =
        friends.filterNot { idOf(it) in excluding }

    /** Places encore libres, moi, le principal, le maillage et les invitations qui sonnent comptés. */
    fun remainingSeats(roster: GroupCallRoster, hasPrimaryOutsideRoster: Boolean, ringingCount: Int): Int {
        val present = roster.participantCount + (if (hasPrimaryOutsideRoster) 1 else 0) + ringingCount
        return maxOf(0, roster.capacity - present)
    }
}
