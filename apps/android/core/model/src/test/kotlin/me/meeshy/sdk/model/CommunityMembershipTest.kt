package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityMembershipTest {

    private fun member(userId: String, role: String) = ApiCommunityMember(id = "m-$userId", userId = userId, role = role)

    @Test
    fun `le createur sans ligne de membre est membre, admin et createur`() {
        val membership = CommunityMembership.resolve(createdBy = "me", meId = "me", members = emptyList())

        assertThat(membership.isCreator).isTrue()
        assertThat(membership.isMember).isTrue()
        assertThat(membership.role).isEqualTo(MemberRole.ADMIN)
        assertThat(membership.isAdmin).isTrue()
    }

    @Test
    fun `un membre simple n'est pas admin`() {
        val membership = CommunityMembership.resolve("owner", "me", listOf(member("me", "member")))

        assertThat(membership.isCreator).isFalse()
        assertThat(membership.isMember).isTrue()
        assertThat(membership.role).isEqualTo(MemberRole.MEMBER)
        assertThat(membership.isAdmin).isFalse()
    }

    @Test
    fun `un non membre n'a ni role ni droit`() {
        val membership = CommunityMembership.resolve("owner", "me", listOf(member("other", "admin")))

        assertThat(membership.isMember).isFalse()
        assertThat(membership.role).isNull()
        assertThat(membership.isAdmin).isFalse()
    }

    @Test
    fun `un moderateur n'est pas admin`() {
        val membership = CommunityMembership.resolve("owner", "me", listOf(member("me", "MODERATOR")))

        assertThat(membership.role).isEqualTo(MemberRole.MODERATOR)
        assertThat(membership.isAdmin).isFalse()
    }

    @Test
    fun `un admin est admin sans etre createur`() {
        val membership = CommunityMembership.resolve("owner", "me", listOf(member("me", "admin")))

        assertThat(membership.isCreator).isFalse()
        assertThat(membership.isAdmin).isTrue()
    }

    @Test
    fun `le role de la ligne prime sur le repli admin du createur`() {
        val membership = CommunityMembership.resolve("me", "me", listOf(member("me", "creator")))

        assertThat(membership.role).isEqualTo(MemberRole.CREATOR)
        assertThat(membership.isAdmin).isTrue()
    }

    @Test
    fun `un role inconnu vaut membre`() {
        assertThat(member("x", "wizard").communityRole).isEqualTo(MemberRole.MEMBER)
        assertThat(member("x", "Creator").communityRole).isEqualTo(MemberRole.CREATOR)
    }

    @Test
    fun `sans moi, personne n'est membre`() {
        val membership = CommunityMembership.resolve("owner", null, listOf(member("me", "admin")))

        assertThat(membership.isMember).isFalse()
        assertThat(membership.isCreator).isFalse()
    }
}
