package me.meeshy.sdk.model

/** Une section de la liste des membres : un rôle et ses membres — port de `CommunityMemberSection` (iOS). */
data class CommunityMemberSection(
    val role: MemberRole,
    val members: List<ApiCommunityMember>,
) {
    companion object {
        /** Rôle décroissant, section vide omise, ordre interne conservé. */
        fun sections(members: List<ApiCommunityMember>): List<CommunityMemberSection> =
            members.groupBy { it.communityRole }
                .map { (role, group) -> CommunityMemberSection(role, group) }
                .sortedByDescending { it.role.level }
    }
}
