package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareLinkEligibilityTest {

    private fun conversation(
        id: String,
        type: String,
        role: String?,
        currentUserId: String = "me",
    ) = ApiConversation(
        id = id,
        type = type,
        participants = listOf(ApiParticipant(id = "p1", userId = currentUserId, role = role)),
    )

    @Test
    fun `a direct conversation is never eligible, even for its creator`() {
        val conversation = conversation(id = "c1", type = "direct", role = "creator")

        assertThat(ShareLinkEligibility.isEligible(conversation, "me")).isFalse()
    }

    @Test
    fun `a group conversation is eligible for a moderator, an admin and a creator`() {
        listOf("moderator", "admin", "creator").forEach { role ->
            val conversation = conversation(id = "c1", type = "group", role = role)

            assertThat(ShareLinkEligibility.isEligible(conversation, "me")).isTrue()
        }
    }

    @Test
    fun `a group conversation is not eligible for a plain member`() {
        val conversation = conversation(id = "c1", type = "group", role = "member")

        assertThat(ShareLinkEligibility.isEligible(conversation, "me")).isFalse()
    }

    @Test
    fun `an absent or unrecognized role decodes to MEMBER and is not eligible`() {
        val absent = ApiConversation(id = "c1", type = "group", participants = emptyList())
        val unrecognized = conversation(id = "c2", type = "group", role = "unknown-role")

        assertThat(ShareLinkEligibility.isEligible(absent, "me")).isFalse()
        assertThat(ShareLinkEligibility.isEligible(unrecognized, "me")).isFalse()
    }

    @Test
    fun `a community conversation follows the same non-direct rule as group`() {
        listOf("moderator", "admin", "creator").forEach { role ->
            val conversation = conversation(id = "c1", type = "community", role = role)

            assertThat(ShareLinkEligibility.isEligible(conversation, "me")).isTrue()
        }
        val member = conversation(id = "c2", type = "community", role = "member")
        assertThat(ShareLinkEligibility.isEligible(member, "me")).isFalse()
    }

    @Test
    fun `a public conversation is eligible for any member, no rank required`() {
        val plainMember = conversation(id = "c1", type = "public", role = "member")

        assertThat(ShareLinkEligibility.isEligible(plainMember, "me")).isTrue()
    }

    @Test
    fun `a global conversation ignores the conversation-level role and requires a platform admin`() {
        val moderatorNoPlatformRole = conversation(id = "c1", type = "global", role = "moderator")

        assertThat(
            ShareLinkEligibility.isEligible(moderatorNoPlatformRole, "me", platformRole = UserRole.USER),
        ).isFalse()
        assertThat(
            ShareLinkEligibility.isEligible(moderatorNoPlatformRole, "me", platformRole = UserRole.ADMIN),
        ).isTrue()
        assertThat(
            ShareLinkEligibility.isEligible(moderatorNoPlatformRole, "me", platformRole = UserRole.BIGBOSS),
        ).isTrue()
    }

    @Test
    fun `a moderator absent from the truncated top-5 participants stays eligible via the server-computed role`() {
        val conversation = ApiConversation(
            id = "c1",
            type = "group",
            participants = List(5) { ApiParticipant(id = "p$it", userId = "other-$it", role = "member") },
            currentUserRole = "moderator",
        )

        assertThat(ShareLinkEligibility.isEligible(conversation, "me")).isTrue()
    }

    @Test
    fun `eligibleConversations filters the list and preserves input order`() {
        val directEligibleByRole = conversation(id = "direct-creator-id", type = "direct", role = "creator")
        val groupModerator = conversation(id = "group-moderator-id", type = "group", role = "moderator")
        val groupMember = conversation(id = "group-member-id", type = "group", role = "member")
        val publicModerator = conversation(id = "public-moderator-id", type = "public", role = "moderator")

        val result = ShareLinkEligibility.eligibleConversations(
            listOf(directEligibleByRole, groupModerator, groupMember, publicModerator),
            "me",
        )

        assertThat(result.map { it.id }).containsExactly("group-moderator-id", "public-moderator-id").inOrder()
    }
}
