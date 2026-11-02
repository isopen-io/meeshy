package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les critères de la loi des actions de conversation dits en clair. */
class ConversationActionPolicyTest {

    private fun actions(
        type: String,
        platformRole: String? = "USER",
        conversationRole: String? = "member",
        isActive: Boolean? = true,
    ) = ConversationActionPolicy.actionsFor(
        ConversationActionPolicy.Input(
            conversation = MessageActionPolicy.Conversation(type = type, isActive = isActive),
            viewer = ConversationViewerAuthority(
                id = "user-viewer",
                hasAccount = true,
                isAnonymous = false,
                platformRoleRaw = platformRole,
                conversationRoleRaw = conversationRole,
                isActiveMember = true,
                canSendMessages = true,
                isDeclaredMinor = false,
            ),
        ),
    )

    @Test
    fun `Global is never renamed, left nor deleted for all, even by a BIGBOSS creator`() {
        val result = actions("global", platformRole = "BIGBOSS", conversationRole = "creator")
        assertThat(result.rename).isFalse()
        assertThat(result.leave).isFalse()
        assertThat(result.deleteForAll).isFalse()
        assertThat(result.invite).isTrue()
        assertThat(result.manageMembers).isTrue()
    }

    @Test
    fun `only privileged platform roles invite into Global`() {
        assertThat(actions("global", platformRole = "MODERATOR", conversationRole = "creator").invite).isTrue()
        assertThat(actions("global", platformRole = "ADMIN").invite).isTrue()
        assertThat(actions("global", platformRole = "AUDIT", conversationRole = "creator").invite).isFalse()
    }

    @Test
    fun `a direct has no authority`() {
        val result = actions("direct", conversationRole = "creator")
        assertThat(result.rename).isFalse()
        assertThat(result.invite).isFalse()
        assertThat(result.leave).isFalse()
        assertThat(result.deleteForAll).isFalse()
        assertThat(result.manageMembers).isFalse()
        assertThat(result.call).isTrue()
    }

    @Test
    fun `adminOpen is reserved to ADMIN and BIGBOSS`() {
        assertThat(actions("group", platformRole = "ADMIN").adminOpen).isTrue()
        assertThat(actions("group", platformRole = "BIGBOSS").adminOpen).isTrue()
        assertThat(actions("group", platformRole = "MODERATOR").adminOpen).isFalse()
    }

    @Test
    fun `a closed conversation is no longer modified`() {
        val result = actions("group", conversationRole = "creator", isActive = false)
        assertThat(result.rename).isFalse()
        assertThat(result.deleteForAll).isFalse()
        assertThat(result.call).isFalse()
        assertThat(result.hide).isTrue()
    }

    @Test
    fun `an unknown type opens nothing that depends on the type`() {
        val result = actions("mystery", conversationRole = "creator")
        assertThat(result.rename).isFalse()
        assertThat(result.invite).isFalse()
        assertThat(result.call).isFalse()
    }
}
