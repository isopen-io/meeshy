package me.meeshy.sdk.model

/** Les boutons de la rangée d'actions du détail, dans l'ordre où l'écran les pose. */
enum class CommunityDetailAction { MEMBERS, INVITE, CHANNEL, SETTINGS, JOIN }

/**
 * Ce que je peux faire dans une communauté — l'unique endroit où la passerelle (`routes/communities/`)
 * est traduite en droits d'écran, pour qu'aucun contrôle n'offre ce qui reviendrait en 403.
 *
 * Les règles suivent le serveur, pas seulement iOS : ajouter / promouvoir / retirer un membre et
 * rattacher un channel exigent le rôle ADMIN (le créateur en porte la ligne) ; modifier ou supprimer la
 * communauté est réservé au créateur ; inviter dans une communauté PRIVÉE exige ADMIN ou MODÉRATEUR ;
 * le créateur ne peut pas la quitter ; la liste des membres d'une communauté privée est réservée aux membres.
 */
data class CommunityAccess(
    val membership: CommunityMembership,
    val isPrivate: Boolean,
) {
    val isCreator: Boolean get() = membership.isCreator
    val isMember: Boolean get() = membership.isMember
    val isAdmin: Boolean get() = membership.isAdmin

    val canInvite: Boolean
        get() = isMember && (!isPrivate || isAdmin || membership.role == MemberRole.MODERATOR)
    val canManageMembers: Boolean get() = isAdmin
    val canAddChannel: Boolean get() = isAdmin
    val canEditSettings: Boolean get() = isCreator
    val canLeave: Boolean get() = isMember && !isCreator
    val canJoin: Boolean get() = !isMember
    val canSeeMembers: Boolean get() = isMember || !isPrivate

    /** Le menu « … » de l'en-tête : réglages pour le créateur, sortie pour un admin qui ne l'est pas. */
    val showsHeaderMenu: Boolean get() = isAdmin && (canEditSettings || canLeave)

    /** La rangée d'actions : Membres · Inviter · Channel · Réglages, ou Rejoindre à la place des réglages. */
    val detailActions: List<CommunityDetailAction>
        get() = buildList {
            if (canSeeMembers) add(CommunityDetailAction.MEMBERS)
            if (canInvite) add(CommunityDetailAction.INVITE)
            if (canAddChannel) add(CommunityDetailAction.CHANNEL)
            if (canEditSettings) add(CommunityDetailAction.SETTINGS)
            else if (canJoin) add(CommunityDetailAction.JOIN)
        }

    companion object {
        fun resolve(
            createdBy: String,
            isPrivate: Boolean,
            meId: String?,
            members: List<ApiCommunityMember>,
        ): CommunityAccess = CommunityAccess(CommunityMembership.resolve(createdBy, meId, members), isPrivate)
    }
}

/**
 * Ce qu'on peut faire d'une ligne de la liste des membres : changer son rôle (parmi ceux que la
 * passerelle accepte — admin, modérateur, membre — hors le sien) et le retirer. Jamais sur soi-même
 * (on quitte par « Quitter »), jamais sur le créateur.
 */
data class CommunityMemberActions(
    val assignableRoles: List<MemberRole>,
    val canRemove: Boolean,
) {
    val isEmpty: Boolean get() = assignableRoles.isEmpty() && !canRemove

    companion object {
        val None = CommunityMemberActions(emptyList(), canRemove = false)

        val ASSIGNABLE: List<MemberRole> = listOf(MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER)

        fun forMember(
            viewerCanManage: Boolean,
            viewerId: String?,
            createdBy: String,
            member: ApiCommunityMember,
        ): CommunityMemberActions = when {
            !viewerCanManage -> None
            member.userId == viewerId -> None
            member.userId == createdBy -> None
            else -> CommunityMemberActions(
                assignableRoles = ASSIGNABLE.filter { it != member.communityRole },
                canRemove = true,
            )
        }
    }
}
