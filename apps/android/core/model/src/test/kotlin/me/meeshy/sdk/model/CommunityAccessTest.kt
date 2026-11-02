package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityAccessTest {

    private fun member(userId: String, role: String) = ApiCommunityMember(id = "m-$userId", userId = userId, role = role)

    private fun access(role: String?, isPrivate: Boolean = false, me: String = "me", createdBy: String = "owner") =
        CommunityAccess.resolve(createdBy, isPrivate, me, listOfNotNull(role?.let { member("me", it) }))

    @Test
    fun `le createur edite, administre et ne peut pas quitter`() {
        val a = CommunityAccess.resolve("me", true, "me", emptyList())
        assertThat(a.canEditSettings).isTrue()
        assertThat(a.canManageMembers).isTrue()
        assertThat(a.canAddChannel).isTrue()
        assertThat(a.canLeave).isFalse()
        assertThat(a.canJoin).isFalse()
    }

    @Test
    fun `un admin non createur ne regle pas mais quitte`() {
        val a = access("admin")
        assertThat(a.canEditSettings).isFalse()
        assertThat(a.canAddChannel).isTrue()
        assertThat(a.canLeave).isTrue()
        assertThat(a.showsHeaderMenu).isTrue()
    }

    @Test
    fun `un membre simple n'a pas de menu d'en-tete`() {
        val a = access("member")
        assertThat(a.showsHeaderMenu).isFalse()
        assertThat(a.canManageMembers).isFalse()
        assertThat(a.canAddChannel).isFalse()
    }

    @Test
    fun `inviter dans une communaute privee exige admin ou moderateur`() {
        assertThat(access("member", isPrivate = true).canInvite).isFalse()
        assertThat(access("moderator", isPrivate = true).canInvite).isTrue()
        assertThat(access("admin", isPrivate = true).canInvite).isTrue()
    }

    @Test
    fun `dans une communaute publique tout membre invite, un non membre jamais`() {
        assertThat(access("member").canInvite).isTrue()
        assertThat(access(null).canInvite).isFalse()
    }

    @Test
    fun `un non membre rejoint et ne voit pas les membres d'une communaute privee`() {
        val priv = access(null, isPrivate = true)
        assertThat(priv.canJoin).isTrue()
        assertThat(priv.canSeeMembers).isFalse()
        assertThat(access(null).canSeeMembers).isTrue()
    }

    @Test
    fun `la rangee d'actions suit l'ordre de l'ecran`() {
        assertThat(CommunityAccess.resolve("me", false, "me", emptyList()).detailActions)
            .containsExactly(
                CommunityDetailAction.MEMBERS,
                CommunityDetailAction.INVITE,
                CommunityDetailAction.CHANNEL,
                CommunityDetailAction.SETTINGS,
            ).inOrder()
        assertThat(access(null).detailActions)
            .containsExactly(CommunityDetailAction.MEMBERS, CommunityDetailAction.JOIN).inOrder()
        assertThat(access("member").detailActions)
            .containsExactly(CommunityDetailAction.MEMBERS, CommunityDetailAction.INVITE).inOrder()
    }

    @Test
    fun `un non membre d'une communaute privee ne voit que Rejoindre`() {
        assertThat(access(null, isPrivate = true).detailActions).containsExactly(CommunityDetailAction.JOIN)
    }

    @Test
    fun `un admin gere les autres membres, pas lui-meme ni le createur`() {
        val other = member("u2", "member")
        val actions = CommunityMemberActions.forMember(true, "me", "owner", other)
        assertThat(actions.assignableRoles).containsExactly(MemberRole.ADMIN, MemberRole.MODERATOR).inOrder()
        assertThat(actions.canRemove).isTrue()

        assertThat(CommunityMemberActions.forMember(true, "me", "owner", member("me", "admin")).isEmpty).isTrue()
        assertThat(CommunityMemberActions.forMember(true, "me", "owner", member("owner", "admin")).isEmpty).isTrue()
    }

    @Test
    fun `un non admin n'a aucune action sur les membres`() {
        assertThat(CommunityMemberActions.forMember(false, "me", "owner", member("u2", "member")).isEmpty).isTrue()
    }

    @Test
    fun `le role courant n'est pas reproposé et creator n'est jamais assignable`() {
        val actions = CommunityMemberActions.forMember(true, "me", "owner", member("u2", "admin"))
        assertThat(actions.assignableRoles).containsExactly(MemberRole.MODERATOR, MemberRole.MEMBER).inOrder()
        assertThat(CommunityMemberActions.ASSIGNABLE).doesNotContain(MemberRole.CREATOR)
    }
}
