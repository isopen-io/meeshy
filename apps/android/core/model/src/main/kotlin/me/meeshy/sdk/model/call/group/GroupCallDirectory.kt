package me.meeshy.sdk.model.call.group

import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.call.ActiveCallSession

/**
 * Ce que l'appareil sait des membres d'un appel de groupe hors des `call:participant-joined` — miroir de iOS
 * `GroupCallMeshCoordinator.enrich` (#13754). Un membre découvert par son OFFRE (rejoindre un appel en cours, être
 * invité) n'a jamais été annoncé : son nom et son avatar viennent du membre de la conversation en cache, puis de
 * l'appel actif (`GET /conversations/:id/active-call`), lu une fois par appel.
 *
 * [presentIds] sont les membres que la passerelle tient pour présents (appel actif, sans `leftAt`) : ils comptent
 * quand le principal part et qu'il faut savoir si le groupe continue.
 */
data class GroupCallDirectory(
    val groupTitle: String? = null,
    val names: Map<String, GroupCallArrival> = emptyMap(),
    val presentIds: Set<String> = emptySet(),
) {
    /** [later] complète ce qui est déjà su : un nom non vide l'emporte, un titre de groupe se garde s'il manque. */
    fun merging(later: GroupCallDirectory): GroupCallDirectory = GroupCallDirectory(
        groupTitle = later.groupTitle ?: groupTitle,
        names = later.names.entries.fold(names) { known, (id, next) ->
            known + (id to (known[id]?.let { mergedName(it, next) } ?: next))
        },
        presentIds = presentIds + later.presentIds,
    )

    private fun mergedName(known: GroupCallArrival, later: GroupCallArrival): GroupCallArrival = known.copy(
        displayName = later.displayName ?: known.displayName,
        avatarUrl = later.avatarUrl ?: known.avatarUrl,
    )

    companion object {
        val EMPTY = GroupCallDirectory()

        /** Le trombinoscope de la conversation, tel que le cache le garde. */
        fun fromConversation(groupTitle: String?, members: List<PaginatedParticipant>): GroupCallDirectory =
            GroupCallDirectory(
                groupTitle = groupTitle?.trim()?.takeIf { it.isNotEmpty() },
                names = members.mapNotNull { member ->
                    val userId = member.userId?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                    userId to GroupCallArrival(userId, displayName = nameOf(member), avatarUrl = member.avatar.nonBlank())
                }.toMap(),
            )

        /** L'appel actif de la passerelle : ses membres présents, nommés par leur profil. Un autre appel ne compte pas. */
        fun fromActiveCall(session: ActiveCallSession, callId: String): GroupCallDirectory {
            if (session.id != callId) return EMPTY
            val present = session.participants.filterNot { it.hasLeft }
            return GroupCallDirectory(
                names = present.associate { participant ->
                    val user = participant.user
                    val name = user?.displayName.nonBlank() ?: user?.username.nonBlank()
                    participant.userId to GroupCallArrival(participant.userId, displayName = name, avatarUrl = user?.avatar.nonBlank())
                },
                presentIds = present.mapTo(LinkedHashSet()) { it.userId },
            )
        }

        private fun nameOf(member: PaginatedParticipant): String? =
            member.displayName.nonBlank()
                ?: listOfNotNull(member.firstName.nonBlank(), member.lastName.nonBlank()).joinToString(" ").nonBlank()
                ?: member.username.nonBlank()

        private fun String?.nonBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
    }
}

/**
 * Les membres du registre que l'annuaire connaît prennent son nom et son avatar là où ils n'en ont pas : ce que
 * `call:participant-joined` a déjà dit d'un membre n'est jamais remplacé. L'annuaire n'admet personne.
 */
fun GroupCallRoster.named(directory: GroupCallDirectory): GroupCallRoster =
    members.fold(this) { roster, member ->
        val known = directory.names[member.userId] ?: return@fold roster
        val name = known.displayName.takeIf { member.displayName.isBlank() }
        val avatar = known.avatarUrl.takeIf { member.avatarUrl.isNullOrBlank() }
        if (name == null && avatar == null) return@fold roster
        roster.admitting(GroupCallArrival(member.userId, displayName = name, avatarUrl = avatar))
    }

/**
 * Le nom de l'appel quand le siège du principal se libère — iOS `GroupCallRoster.callTitle` (#9091) : le titre du
 * groupe s'il en a un ; sinon ceux qui restent, deux nommés puis « +N » ; personne, « Participants à l'appel ».
 */
sealed interface GroupCallTitle {
    data class Group(val title: String) : GroupCallTitle

    /** [names] dans l'ordre d'arrivée ; un nom vide est un membre encore inconnu (« Participant »). */
    data class Members(val names: List<String>, val more: Int) : GroupCallTitle

    data object Everyone : GroupCallTitle

    companion object {
        const val TITLED_MEMBERS: Int = 2

        fun of(roster: GroupCallRoster, groupTitle: String?): GroupCallTitle {
            groupTitle?.trim()?.takeIf { it.isNotEmpty() }?.let { return Group(it) }
            if (roster.members.isEmpty()) return Everyone
            val names = roster.members.map { it.displayName.trim() }
            return Members(names.take(TITLED_MEMBERS), more = (names.size - TITLED_MEMBERS).coerceAtLeast(0))
        }
    }
}
