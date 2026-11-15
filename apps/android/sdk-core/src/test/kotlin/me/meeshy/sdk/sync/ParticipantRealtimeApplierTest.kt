package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantJoinedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import me.meeshy.sdk.model.ParticipantUnbannedEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.model.sync.ParticipantFold
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

class ParticipantRealtimeApplierTest {

    private class Rig {
        val left = MutableSharedFlow<ParticipantLeftEvent>()
        val banned = MutableSharedFlow<ParticipantBannedEvent>()
        val joined = MutableSharedFlow<ParticipantJoinedEvent>()
        val unbanned = MutableSharedFlow<ParticipantUnbannedEvent>()
        val role = MutableSharedFlow<ParticipantRoleUpdatedEvent>()
        val folds = mutableListOf<(ApiConversation) -> ParticipantFold.Outcome>()
        val patcher = mockk<ConversationLivePatcher>(relaxed = true)
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(StarredMessage(messageId = "m", conversationId = "c1"))))
        val registrar = RecordingRegistrar()

        init {
            coEvery { patcher.applyParticipant(any(), capture(folds)) } returns Unit
            val socket = mockk<MessageSocketManager> {
                every { participantLeft } returns left
                every { participantBanned } returns banned
                every { participantJoined } returns joined
                every { participantUnbanned } returns unbanned
                every { participantRoleUpdated } returns role
            }
            val session = mockk<SessionRepository> {
                every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
            }
            ParticipantRealtimeApplier(socket, patcher, stars, session).subscribe(registrar)
        }
    }

    private fun group() = ApiConversation(
        id = "c1",
        type = "group",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", role = "member"),
            ApiParticipant(id = "p-a", userId = "alice", role = "member"),
        ),
        serverMemberCount = 2,
    )

    @Test
    fun `mon depart retire la conversation et ses etoiles`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.left, ParticipantLeftEvent("c1", userId = "me"))
        coVerify(exactly = 1) { rig.patcher.remove("c1") }
        assertThat(rig.stars.starred.value.items).isEmpty()
        coVerify(exactly = 0) { rig.patcher.applyParticipant(any(), any()) }
    }

    @Test
    fun `mon bannissement retire la conversation`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.banned, ParticipantBannedEvent(conversationId = "c1", userId = "me"))
        coVerify(exactly = 1) { rig.patcher.remove("c1") }
    }

    @Test
    fun `le depart d'un autre met le roster et le compte a jour`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.left, ParticipantLeftEvent("c1", userId = "alice"))
        coVerify(exactly = 0) { rig.patcher.remove(any()) }
        val outcome = rig.folds.single()(group())
        val row = (outcome as ParticipantFold.Outcome.Updated).conversation
        assertThat(row.participants.map { it.userId }).containsExactly("me")
        assertThat(row.memberCount).isEqualTo(1)
    }

    @Test
    fun `un changement de role met le rang de la ligne a jour`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.role, ParticipantRoleUpdatedEvent("c1", userId = "me", role = "admin"))
        val row = (rig.folds.single()(group()) as ParticipantFold.Outcome.Updated).conversation
        assertThat(row.currentUserRole).isEqualTo("admin")
    }

    @Test
    fun `un changement de role sans effet ne touche pas la ligne`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.role, ParticipantRoleUpdatedEvent("c1", userId = "alice", role = "member"))
        assertThat(rig.folds.single()(group())).isEqualTo(ParticipantFold.Outcome.Unchanged)
    }

    @Test
    fun `arrivee et fin de bannissement passent par le patcher`() = runTest {
        val rig = Rig()
        val joined = ParticipantJoinedEvent(conversationId = "c1", userId = "x")
        val unbanned = ParticipantUnbannedEvent(conversationId = "c1", userId = "y")
        rig.registrar.deliver(rig.joined, joined)
        rig.registrar.deliver(rig.unbanned, unbanned)
        coVerify { rig.patcher.applyJoined(joined) }
        coVerify { rig.patcher.applyUnbanned(unbanned) }
    }
}
