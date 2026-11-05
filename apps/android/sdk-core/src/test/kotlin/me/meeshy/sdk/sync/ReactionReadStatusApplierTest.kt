package me.meeshy.sdk.sync

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.ReadStatusSummary
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.reaction.ReactionRowStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

class ReactionReadStatusApplierTest {

    private val added = MutableSharedFlow<ReactionUpdateEvent>()
    private val removed = MutableSharedFlow<ReactionUpdateEvent>()
    private val readStatus = MutableSharedFlow<ReadStatusUpdatedEvent>()
    private val rows = mockk<ReactionRowStore> { coEvery { rows(any()) } returns emptyList() }
    private val messages = mockk<MessageRepository>(relaxed = true)

    private fun registrar(open: OpenConversationLookup = OpenConversationLookup.None) = RecordingRegistrar().also {
        val socket = mockk<MessageSocketManager> {
            every { reactionAdded } returns added
            every { reactionRemoved } returns removed
            every { readStatusUpdated } returns readStatus
        }
        val session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        }
        ReactionReadStatusApplier(socket, messages, rows, session, open).subscribe(it)
    }

    private fun reaction() = ReactionUpdateEvent(messageId = "m1", conversationId = "c1", userId = "bob", emoji = "🔥")

    @Test
    fun `une reaction ajoutee bouge le compteur quand sa ligne a bouge`() = runTest {
        coEvery { rows.record("m1", "🔥", true, any(), "bob", "me", any()) } returns true
        registrar().deliver(added, reaction())
        coVerify(exactly = 1) { messages.applyReactionDelta("m1", "🔥", 1) }
    }

    @Test
    fun `un echo en double ne compte pas deux fois`() = runTest {
        coEvery { rows.record(any(), any(), any(), any(), any(), any(), any()) } returns false
        registrar().deliver(added, reaction())
        coVerify(exactly = 0) { messages.applyReactionDelta(any(), any(), any()) }
    }

    @Test
    fun `une reaction retiree decremente`() = runTest {
        coEvery { rows.record("m1", "🔥", false, any(), "bob", "me", any()) } returns true
        registrar().deliver(removed, reaction())
        coVerify(exactly = 1) { messages.applyReactionDelta("m1", "🔥", -1) }
    }

    @Test
    fun `la conversation ouverte garde son propre ecouteur`() = runTest {
        registrar(open = { true }).deliver(added, reaction())
        coVerify(exactly = 0) { rows.record(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `un accuse de lecture met les coches a jour pour moi`() = runTest {
        val summary = ReadStatusSummary(totalMembers = 3, readCount = 2)
        registrar().deliver(readStatus, ReadStatusUpdatedEvent("c1", participantId = "p", summary = summary))
        coVerify(exactly = 1) { messages.applyReadStatusSummary("c1", summary, "me") }
    }
}
