package me.meeshy.sdk.model

/**
 * Ce que je suis dans une communauté — la loi que `CommunityDetailViewModel` (iOS) calcule en
 * ligne. Le créateur n'a pas toujours de ligne de membre : il reste membre et ADMIN.
 */
data class CommunityMembership(
    val isCreator: Boolean,
    val isMember: Boolean,
    val role: MemberRole?,
) {
    val isAdmin: Boolean get() = isCreator || (role?.hasMinimumRole(MemberRole.ADMIN) == true)

    companion object {
        /**
         * Le rôle SERVI ([servedRole], `currentUserRole`) passe en premier ; la ligne du lecteur dans
         * [members] ne sert qu'à un ancien serveur qui ne le sert pas ; le créateur vaut admin (#16602,
         * miroir `CommunityDetailViewModel.applyMembership` iOS).
         */
        fun resolve(
            createdBy: String,
            meId: String?,
            members: List<ApiCommunityMember>,
            servedRole: String? = null,
        ): CommunityMembership {
            val isCreator = meId != null && createdBy == meId
            val held = servedRole?.let(MemberRole::from)
                ?: meId?.let { id -> members.firstOrNull { it.userId == id } }?.communityRole
            return CommunityMembership(
                isCreator = isCreator,
                isMember = isCreator || held != null,
                role = held ?: MemberRole.ADMIN.takeIf { isCreator },
            )
        }
    }
}
