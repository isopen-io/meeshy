package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MemberActionPolicy.Kind
import org.junit.Test

class MemberActionPolicyTest {

    private fun target(role: String, userId: String? = "u-target", id: String = "p-target") =
        PaginatedParticipant(id = id, userId = userId, conversationRole = role)

    private fun kinds(viewer: MemberRole, role: String, userId: String? = "u-target") =
        MemberActionPolicy.actions(target(role, userId), viewer).map { it.kind }

    @Test
    fun `the creator offers every action on a plain member`() {
        assertThat(kinds(MemberRole.CREATOR, "member"))
            .containsExactly(Kind.PROMOTE_TO_ADMIN, Kind.PROMOTE_TO_MODERATOR, Kind.EXPEL, Kind.BAN).inOrder()
    }

    @Test
    fun `the creator may promote a moderator to admin or demote them`() {
        assertThat(kinds(MemberRole.CREATOR, "moderator"))
            .containsExactly(Kind.PROMOTE_TO_ADMIN, Kind.DEMOTE_TO_MEMBER, Kind.EXPEL, Kind.BAN).inOrder()
    }

    @Test
    fun `the creator may only demote an admin`() {
        assertThat(kinds(MemberRole.CREATOR, "admin"))
            .containsExactly(Kind.DEMOTE_TO_MEMBER, Kind.EXPEL, Kind.BAN).inOrder()
    }

    @Test
    fun `an admin promotes a member to moderator but never to admin`() {
        assertThat(kinds(MemberRole.ADMIN, "member"))
            .containsExactly(Kind.PROMOTE_TO_MODERATOR, Kind.EXPEL, Kind.BAN).inOrder()
    }

    @Test
    fun `an admin may demote a moderator but cannot touch a peer admin`() {
        assertThat(kinds(MemberRole.ADMIN, "moderator")).containsExactly(Kind.DEMOTE_TO_MEMBER, Kind.EXPEL, Kind.BAN).inOrder()
        assertThat(kinds(MemberRole.ADMIN, "admin")).isEmpty()
    }

    @Test
    fun `a moderator can only expel a plain member and never ban`() {
        assertThat(kinds(MemberRole.MODERATOR, "member")).containsExactly(Kind.EXPEL)
        assertThat(kinds(MemberRole.MODERATOR, "moderator")).isEmpty()
    }

    @Test
    fun `a plain member gets nothing`() {
        assertThat(kinds(MemberRole.MEMBER, "member")).isEmpty()
    }

    @Test
    fun `nobody acts on the creator`() {
        MemberRole.entries.forEach { assertThat(kinds(it, "creator")).isEmpty() }
    }

    @Test
    fun `an accountless visitor can be expelled and banned but never ranked`() {
        assertThat(kinds(MemberRole.CREATOR, "member", userId = null)).containsExactly(Kind.EXPEL, Kind.BAN).inOrder()
        assertThat(kinds(MemberRole.MODERATOR, "member", userId = null)).containsExactly(Kind.EXPEL)
    }

    @Test
    fun `the address key is the user id for an account and the participant id for a visitor`() {
        val account = MemberActionPolicy.actions(target("member"), MemberRole.ADMIN)
        val visitor = MemberActionPolicy.actions(target("member", userId = null), MemberRole.ADMIN)
        assertThat(account.map { it.targetKey }.toSet()).containsExactly("u-target")
        assertThat(visitor.map { it.targetKey }.toSet()).containsExactly("p-target")
    }

    @Test
    fun `only role changes carry a target role`() {
        assertThat(Kind.PROMOTE_TO_ADMIN.targetRole).isEqualTo(MemberRole.ADMIN)
        assertThat(Kind.PROMOTE_TO_MODERATOR.targetRole).isEqualTo(MemberRole.MODERATOR)
        assertThat(Kind.DEMOTE_TO_MEMBER.targetRole).isEqualTo(MemberRole.MEMBER)
        assertThat(Kind.EXPEL.targetRole).isNull()
        assertThat(Kind.BAN.targetRole).isNull()
    }

    @Test
    fun `a missing conversation role reads as member`() {
        val bare = PaginatedParticipant(id = "p", userId = "u")
        assertThat(MemberActionPolicy.actions(bare, MemberRole.ADMIN).map { it.kind })
            .containsExactly(Kind.PROMOTE_TO_MODERATOR, Kind.EXPEL, Kind.BAN).inOrder()
    }

    @Test
    fun `the adding button needs moderator or above`() {
        assertThat(MemberActionPolicy.mayAddMember(MemberRole.MEMBER)).isFalse()
        assertThat(MemberActionPolicy.mayAddMember(MemberRole.MODERATOR)).isTrue()
        assertThat(MemberActionPolicy.mayAddMember(MemberRole.CREATOR)).isTrue()
    }

    @Test
    fun `local search keeps members whose label contains the query ignoring case`() {
        val roster = listOf(
            PaginatedParticipant(id = "1", displayName = "Alice Martin"),
            PaginatedParticipant(id = "2", displayName = "Bob"),
        )
        assertThat(MemberActionPolicy.filter(roster, "  ALI ").map { it.id }).containsExactly("1")
        assertThat(MemberActionPolicy.filter(roster, " ")).isEqualTo(roster)
        assertThat(MemberActionPolicy.filter(roster, "zzz")).isEmpty()
    }
}
