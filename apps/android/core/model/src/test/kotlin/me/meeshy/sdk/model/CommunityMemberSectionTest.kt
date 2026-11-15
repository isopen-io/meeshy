package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityMemberSectionTest {

    private fun member(id: String, role: String) = ApiCommunityMember(id = id, userId = id, role = role)

    @Test
    fun `les sections suivent le role decroissant`() {
        val sections = CommunityMemberSection.sections(
            listOf(member("a", "member"), member("b", "creator"), member("c", "moderator"), member("d", "admin")),
        )

        assertThat(sections.map { it.role }).containsExactly(
            MemberRole.CREATOR, MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER,
        ).inOrder()
    }

    @Test
    fun `une section vide est omise`() {
        val sections = CommunityMemberSection.sections(listOf(member("a", "member"), member("b", "admin")))

        assertThat(sections.map { it.role }).containsExactly(MemberRole.ADMIN, MemberRole.MEMBER).inOrder()
        assertThat(CommunityMemberSection.sections(emptyList())).isEmpty()
    }

    @Test
    fun `l'ordre interne est conserve`() {
        val sections = CommunityMemberSection.sections(
            listOf(member("z", "member"), member("a", "member"), member("m", "member")),
        )

        assertThat(sections.single().members.map { it.id }).containsExactly("z", "a", "m").inOrder()
    }

    @Test
    fun `un role inconnu rejoint les membres`() {
        val sections = CommunityMemberSection.sections(listOf(member("a", "wizard"), member("b", "member")))

        assertThat(sections.single().role).isEqualTo(MemberRole.MEMBER)
        assertThat(sections.single().members).hasSize(2)
    }
}
