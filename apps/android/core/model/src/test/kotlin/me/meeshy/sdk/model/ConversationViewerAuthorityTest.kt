package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationViewerAuthorityTest {

    private fun viewer(
        platformRole: String? = "USER",
        conversationRole: String? = "member",
        isActiveMember: Boolean = true,
        hasAccount: Boolean = true,
        isAnonymous: Boolean = false,
    ) = ConversationViewerAuthority(
        id = "user-viewer",
        participantId = "part-viewer",
        hasAccount = hasAccount,
        isAnonymous = isAnonymous,
        platformRoleRaw = platformRole,
        conversationRoleRaw = conversationRole,
        isActiveMember = isActiveMember,
        canSendMessages = true,
        isDeclaredMinor = false,
    )

    @Test
    fun `an ADMIN or BIGBOSS member takes the creator rank, never above`() {
        assertThat(viewer(platformRole = "ADMIN").effectiveRole).isEqualTo(MemberRole.CREATOR)
        assertThat(viewer(platformRole = "BIGBOSS", conversationRole = "creator").effectiveRank)
            .isEqualTo(MemberRole.CREATOR.level)
        assertThat(viewer(platformRole = "admin").effectiveRole).isEqualTo(MemberRole.CREATOR)
    }

    @Test
    fun `MODERATOR, AUDIT and ANALYST take the rank of their row`() {
        listOf("MODERATOR", "AUDIT", "ANALYST").forEach { role ->
            assertThat(viewer(platformRole = role, conversationRole = "member").effectiveRole).isEqualTo(MemberRole.MEMBER)
            assertThat(viewer(platformRole = role, conversationRole = "admin").effectiveRank).isEqualTo(MemberRole.ADMIN.level)
        }
    }

    @Test
    fun `an unknown conversation rank is worth zero`() {
        assertThat(viewer(conversationRole = "owner").memberRank).isEqualTo(0)
        assertThat(viewer(conversationRole = "owner").effectiveRank).isEqualTo(0)
        assertThat(viewer(conversationRole = null).memberRank).isEqualTo(0)
    }

    @Test
    fun `the row rank is read exactly for messages and case folded for the conversation`() {
        val legacy = viewer(conversationRole = "ADMIN")
        assertThat(legacy.memberRank).isEqualTo(0)
        assertThat(legacy.effectiveRank).isEqualTo(MemberRole.ADMIN.level)
    }

    @Test
    fun `a lowercase moderator does not moderate but a lowercase admin administers`() {
        assertThat(viewer(platformRole = "moderator").moderatesPlatform).isFalse()
        assertThat(viewer(platformRole = "MODERATOR").moderatesPlatform).isTrue()
        assertThat(viewer(platformRole = "admin").administersPlatform).isTrue()
        assertThat(viewer(platformRole = "admin").moderatesPlatform).isFalse()
    }

    @Test
    fun `outside an active membership nothing is ranked`() {
        val gone = viewer(platformRole = "ADMIN", conversationRole = "creator", isActiveMember = false)
        assertThat(gone.memberRank).isEqualTo(0)
        assertThat(gone.effectiveRole).isNull()
        assertThat(gone.effectiveRank).isEqualTo(0)
    }

    @Test
    fun `an anonymous viewer is a guest whatever hasAccount says`() {
        assertThat(viewer(hasAccount = true, isAnonymous = true).isRegistered).isFalse()
        assertThat(viewer(hasAccount = false).isRegistered).isFalse()
        assertThat(viewer().isRegistered).isTrue()
    }
}
