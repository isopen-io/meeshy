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

    private fun sectionConversation(id: String, type: String, title: String) =
        ApiConversation(id = id, type = type, title = title)

    @Test
    fun `sections group conversations into Groups, Communities, Channels and Public in that order`() {
        val conversations = listOf(
            sectionConversation("p", "public", "Open square"),
            sectionConversation("g", "group", "Family"),
            sectionConversation("ch", "channel", "News"),
            sectionConversation("co", "community", "Rustaceans"),
            sectionConversation("gl", "global", "Everyone"),
            sectionConversation("b", "broadcast", "Announcements"),
        )

        val sections = ShareLinkEligibility.sections(conversations, query = "") { it.title.orEmpty() }

        assertThat(sections.map { it.section }).containsExactly(
            ShareLinkPickerSection.Groups,
            ShareLinkPickerSection.Communities,
            ShareLinkPickerSection.Channels,
            ShareLinkPickerSection.Public,
        ).inOrder()
        assertThat(sections.first { it.section == ShareLinkPickerSection.Channels }.conversations.map { it.id })
            .containsExactly("ch", "b").inOrder()
        assertThat(sections.first { it.section == ShareLinkPickerSection.Public }.conversations.map { it.id })
            .containsExactly("p", "gl").inOrder()
    }

    @Test
    fun `sections omit an empty section and filter by a case-insensitive title query`() {
        val conversations = listOf(
            sectionConversation("g1", "group", "Family trip"),
            sectionConversation("g2", "group", "Work"),
            sectionConversation("co", "community", "FAMILY friends"),
        )

        val sections = ShareLinkEligibility.sections(conversations, query = "  family ") { it.title.orEmpty() }

        assertThat(sections.map { it.section })
            .containsExactly(ShareLinkPickerSection.Groups, ShareLinkPickerSection.Communities).inOrder()
        assertThat(sections.first().conversations.map { it.id }).containsExactly("g1")
        assertThat(ShareLinkEligibility.sections(conversations, query = "zzz") { it.title.orEmpty() }).isEmpty()
    }
}
