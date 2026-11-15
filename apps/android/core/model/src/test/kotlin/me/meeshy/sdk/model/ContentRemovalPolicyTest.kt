package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContentRemovalPolicyTest {

    private fun input(type: String, conversationRole: String, authorUserId: String = "user-author") =
        MessageActionPolicy.Input(
            message = MessageActionPolicy.Message(
                subject = MessageContentKind.Subject(id = "65f000000000000000000001", content = "Bonjour"),
                senderId = "part-author",
                authorUserId = authorUserId,
                createdAtMillis = 0L,
            ),
            conversation = MessageActionPolicy.Conversation(type = type),
            viewer = ConversationViewerAuthority(
                id = "user-viewer",
                participantId = "part-viewer",
                hasAccount = true,
                isAnonymous = false,
                platformRoleRaw = "USER",
                conversationRoleRaw = conversationRole,
                isActiveMember = true,
                canSendMessages = true,
                isDeclaredMinor = false,
            ),
            nowMillis = 1_000L,
        )

    @Test
    fun `a conversation moderator removes in a group but never in a direct, nor his own message`() {
        assertThat(ContentRemovalPolicy.mayRemoveMessage(input("group", "moderator"))).isTrue()
        assertThat(ContentRemovalPolicy.mayRemoveMessage(input("direct", "creator"))).isFalse()
        assertThat(ContentRemovalPolicy.mayRemoveMessage(input("group", "admin", authorUserId = "user-viewer"))).isFalse()
        assertThat(ContentRemovalPolicy.mayRemoveMessage(input("group", "member"))).isFalse()
    }

    @Test
    fun `a removal always requires a moderation reason`() {
        val verdict = MessageActionPolicy.actionsFor(input("public", "admin")).verdicts.remove
        assertThat(verdict).isEqualTo(MessageActionPolicy.RemoveVerdict.WithReason)
        assertThat(verdict!!.reasonRequired).isTrue()
        assertThat(ContentRemovalReason.normalized("  ok  ")).isNull()
        assertThat(ContentRemovalReason.normalized("  spam  ")).isEqualTo("spam")
    }

    @Test
    fun `a publication is removed by the platform moderation only, never by its author`() {
        assertThat(ContentRemovalPolicy.mayRemovePublication(authoredByViewer = false, platformRole = "MODERATOR")).isTrue()
        assertThat(ContentRemovalPolicy.mayRemovePublication(authoredByViewer = false, platformRole = "bigboss")).isTrue()
        assertThat(ContentRemovalPolicy.mayRemovePublication(authoredByViewer = true, platformRole = "ADMIN")).isFalse()
        assertThat(ContentRemovalPolicy.mayRemovePublication(authoredByViewer = false, platformRole = "AUDIT")).isFalse()
    }
}
