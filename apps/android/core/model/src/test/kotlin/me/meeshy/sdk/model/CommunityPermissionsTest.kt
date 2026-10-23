package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityPermissionsTest {
    @Test
    fun `createur et admin ont toutes les permissions`() {
        assertThat(CommunityPermissions.forRole(MemberRole.CREATOR)).isEqualTo(CommunityPermission.entries.toSet())
        assertThat(CommunityPermissions.forRole(MemberRole.ADMIN)).isEqualTo(CommunityPermission.entries.toSet())
    }

    @Test
    fun `moderateur n'edite ni ne supprime la communaute et ne gere pas les roles`() {
        val p = CommunityPermissions.forRole(MemberRole.MODERATOR)
        assertThat(p).containsExactly(
            CommunityPermission.INVITE_MEMBERS,
            CommunityPermission.REMOVE_MEMBERS,
            CommunityPermission.MODERATE_CONTENT,
            CommunityPermission.CREATE_CONVERSATIONS,
            CommunityPermission.EDIT_CONVERSATIONS,
        )
    }

    @Test
    fun `membre ne peut que creer des conversations`() {
        assertThat(CommunityPermissions.forRole(MemberRole.MEMBER)).containsExactly(CommunityPermission.CREATE_CONVERSATIONS)
        assertThat(CommunityPermissions.has(MemberRole.MEMBER, CommunityPermission.MANAGE_ROLES)).isFalse()
    }
}
