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
        fun resolve(createdBy: String, meId: String?, members: List<ApiCommunityMember>): CommunityMembership {
            val isCreator = meId != null && createdBy == meId
            val mine = meId?.let { id -> members.firstOrNull { it.userId == id } }
            return CommunityMembership(
                isCreator = isCreator,
                isMember = isCreator || mine != null,
                role = mine?.communityRole ?: MemberRole.ADMIN.takeIf { isCreator },
            )
        }
    }
}
