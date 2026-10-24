package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageActionPolicy.Action
import org.junit.Test

/** Les critères de la loi des actions dits en clair, en plus du rejeu des vecteurs partagés. */
class MessageActionPolicyTest {

    private val created = 1_792_494_000_000L
    private val hour = 60L * 60 * 1000

    private fun viewer(
        platformRole: String? = "USER",
        conversationRole: String? = "member",
        isDeclaredMinor: Boolean = false,
    ) = ConversationViewerAuthority(
        id = "user-viewer",
        participantId = "part-viewer",
        hasAccount = true,
        isAnonymous = false,
        platformRoleRaw = platformRole,
        conversationRoleRaw = conversationRole,
        isActiveMember = true,
        canSendMessages = true,
        isDeclaredMinor = isDeclaredMinor,
    )

    private fun actions(
        mine: Boolean = false,
        type: String = "group",
        encryptionMode: String? = null,
        viewer: ConversationViewerAuthority = viewer(),
        subject: MessageContentKind.Subject = MessageContentKind.Subject(id = "65f000000000000000000001", content = "Bonjour"),
        now: Long = created + hour,
    ) = MessageActionPolicy.actionsFor(
        MessageActionPolicy.Input(
            message = MessageActionPolicy.Message(
                subject = subject,
                senderId = if (mine) "part-viewer" else "part-author",
                authorUserId = if (mine) "user-viewer" else "user-author",
                createdAtMillis = created,
            ),
            conversation = MessageActionPolicy.Conversation(type = type, encryptionMode = encryptionMode),
            viewer = viewer,
            nowMillis = now,
        ),
    )

    @Test
    fun `report follows the TS law, never on his own message, always on someone else`() {
        assertThat(actions(mine = true).verdicts.report).isFalse()
        assertThat(actions(mine = false).verdicts.report).isTrue()
        assertThat(actions(mine = false).groups.more).contains(Action.REPORT)
    }

    @Test
    fun `in E2EE neither edit nor forward, translation on device, server services absent`() {
        val result = actions(mine = true, encryptionMode = "e2ee")
        assertThat(result.verdicts.edit).isNull()
        assertThat(result.verdicts.forward).isFalse()
        assertThat(result.verdicts.translate).isEqualTo(MessageActionPolicy.TranslateVerdict.DEVICE)
        assertThat(result.verdicts.sentiment).isNull()
        assertThat(result.verdicts.serverFeatureAbsence)
            .isEqualTo(MessageActionPolicy.ServerFeatureAbsence.E2EE_SERVER_FEATURE_ABSENT)
    }

    @Test
    fun `the 24 hour edit window includes its bounds and carries windowEndsAt`() {
        val window = MessageActionPolicy.EDIT_WINDOW_MILLIS
        val atBound = actions(mine = true, now = created + window).verdicts.edit
        assertThat(atBound).isEqualTo(MessageActionPolicy.EditVerdict(asModerator = false, windowEndsAtMillis = created + window))
        assertThat(actions(mine = true, now = created + window + 1).verdicts.edit).isNull()
    }

    @Test
    fun `a platform moderator member edits someone else message as moderator, without window`() {
        val edit = actions(mine = false, viewer = viewer(platformRole = "MODERATOR"), now = created + 30 * hour).verdicts.edit
        assertThat(edit).isEqualTo(MessageActionPolicy.EditVerdict(asModerator = true, windowEndsAtMillis = null))
        assertThat(actions(mine = false, viewer = viewer(platformRole = "moderator")).verdicts.edit).isNull()
    }

    @Test
    fun `a direct has no conversation authority, the creator removes nothing`() {
        val result = actions(type = "direct", viewer = viewer(conversationRole = "creator"))
        assertThat(result.verdicts.remove).isNull()
        assertThat(result.groups.moderation).isEmpty()
    }

    @Test
    fun `the author deletes for everyone without window and a moderator removes with a reason`() {
        assertThat(actions(mine = true, now = created + 1_000 * hour).verdicts.deleteForEveryone).isTrue()
        val removal = actions(viewer = viewer(conversationRole = "moderator"))
        assertThat(removal.verdicts.deleteForEveryone).isFalse()
        assertThat(removal.verdicts.remove).isEqualTo(MessageActionPolicy.RemoveVerdict.WithReason)
    }

    @Test
    fun `reply comes first and the primary group is capped at six`() {
        val link = MessageContentKind.Subject(id = "65f000000000000000000001", content = "voir https://meeshy.me")
        val result = actions(mine = true, subject = link)
        assertThat(result.groups.primary.first()).isEqualTo(Action.REPLY)
        assertThat(result.groups.primary.size).isAtMost(MessageActionPolicy.MAX_PRIMARY_ACTIONS)
    }

    @Test
    fun `a minor in Global reacts but neither replies nor edits nor pins`() {
        val result = actions(mine = true, type = "global", viewer = viewer(isDeclaredMinor = true))
        assertThat(result.verdicts.canReact).isTrue()
        assertThat(result.verdicts.canReply).isFalse()
        assertThat(result.verdicts.edit).isNull()
        assertThat(result.verdicts.pin).isNull()
    }

    @Test
    fun `the law is deterministic, the same input gives the same output`() {
        assertThat(actions(mine = true)).isEqualTo(actions(mine = true))
    }
}
