package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationEngagementRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatEngagementControllerTest {

    private fun snap(total: Int, streak: Int = 3, day: String = "2026-10-27", today: Int = 4) =
        ConversationEngagementSnapshot("c1", total, today, streak, day)

    private class FakeHost(override val scope: CoroutineScope, val ui: MutableStateFlow<ChatUiState>) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = ui
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private class Rig(scope: TestScope, served: NetworkResult<ConversationEngagementSnapshot>, listSeed: ConversationEngagementSnapshot?) {
        val stream = MutableStateFlow<ApiConversation?>(ApiConversation(id = "c1", type = "direct", viewerEngagement = listSeed))
        val events = MutableSharedFlow<ConversationSocketEvent>(extraBufferCapacity = 8)
        val ui = MutableStateFlow(ChatUiState(conversationId = "c1"))
        val controller: ChatEngagementController

        init {
            val conversations = mockk<ConversationRepository>()
            every { conversations.conversationStream("c1") } returns stream
            val repository = mockk<ConversationEngagementRepository>()
            coEvery { repository.fetch("c1") } returns served
            val sockets = mockk<ConversationSocketEventsManager>()
            every { sockets.events } returns events
            controller = ChatEngagementController(conversations, repository, sockets)
            controller.attach(FakeHost(scope.backgroundScope, ui))
            scope.runCurrent()
        }
    }

    private fun failure() = NetworkResult.Failure(ApiError("offline"))

    @Test
    fun `the cached list snapshot paints the flame before the network answers`() = runTest {
        val rig = Rig(this, failure(), listSeed = snap(total = 40))
        assertThat(rig.controller.snapshot.value?.totalPoints).isEqualTo(40)
    }

    @Test
    fun `the served snapshot replaces an older cached one`() = runTest {
        val rig = Rig(this, NetworkResult.Success(snap(total = 90)), listSeed = snap(total = 40))
        assertThat(rig.controller.snapshot.value?.totalPoints).isEqualTo(90)
    }

    @Test
    fun `the live event moves the flame and an older one never rolls it back`() = runTest {
        val rig = Rig(this, failure(), listSeed = snap(total = 40))
        rig.events.emit(snap(total = 47))
        runCurrent()
        assertThat(rig.controller.snapshot.value?.totalPoints).isEqualTo(47)
        rig.events.emit(snap(total = 41))
        rig.events.emit(snap(total = 99, day = "2026-10-26"))
        runCurrent()
        assertThat(rig.controller.snapshot.value?.totalPoints).isEqualTo(47)
    }

    @Test
    fun `an event of another conversation is ignored`() = runTest {
        val rig = Rig(this, failure(), listSeed = snap(total = 40))
        rig.events.emit(ConversationEngagementSnapshot("other", 500, 5, 9, "2026-10-27"))
        runCurrent()
        assertThat(rig.controller.snapshot.value?.totalPoints).isEqualTo(40)
    }

    @Test
    fun `a conversation that rewards nothing yet has no flame to show`() = runTest {
        val rig = Rig(this, failure(), listSeed = null)
        assertThat(rig.controller.snapshot.value).isNull()
    }

    @Test
    fun `an own send announces itself once, the ack that renames the bubble does not`() {
        val before = OwnSendDetection.Tail("cid_1", isOutgoing = true)
        assertThat(OwnSendDetection.isNewOwnSend(null, before)).isFalse()
        assertThat(OwnSendDetection.isNewOwnSend(OwnSendDetection.Tail("m0", false), before)).isTrue()
        assertThat(OwnSendDetection.isNewOwnSend(before, before.copy())).isFalse()
        assertThat(OwnSendDetection.isNewOwnSend(OwnSendDetection.Tail("m0", true), OwnSendDetection.Tail("m1", false))).isFalse()
    }
}
