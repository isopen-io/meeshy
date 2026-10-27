package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationAnalysisRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ConversationAnalysis
import me.meeshy.sdk.model.ConversationSummaryAnalysis
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class LivingSummaryControllerTest {

    private class FakeHost(override val scope: CoroutineScope, encryptionMode: String?) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> =
            MutableStateFlow(ChatUiState(conversationId = "c1", encryptionMode = encryptionMode))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private class Rig(
        scope: TestScope,
        guest: AnonymousSessionContext? = null,
        encryptionMode: String? = null,
        result: NetworkResult<ConversationAnalysis> =
            NetworkResult.Success(ConversationAnalysis("c1", ConversationSummaryAnalysis(text = " Un résumé "))),
    ) {
        val repository: ConversationAnalysisRepository = mockk()
        val controller: LivingSummaryController

        init {
            coEvery { repository.fetchAnalysis("c1") } returns result
            val session: SessionRepository = mockk()
            every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "u1", username = "meeshy"))
            val store: AnonymousSessionStore = mockk()
            coEvery { store.load() } returns guest
            controller = LivingSummaryController(repository, session, store)
            controller.attach(FakeHost(scope.backgroundScope, encryptionMode))
            scope.runCurrent()
        }
    }

    private fun guestSession() = AnonymousSessionContext("t", "p-9", ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = true, canSendImages = true), "l1", "c1")

    @Test
    fun `a registered reader is identified by his id and username`() = runTest {
        assertThat(Rig(this).controller.viewer.value).isEqualTo(SummaryViewer("u1", "meeshy"))
    }

    @Test
    fun `a guest is identified by his participant id, with no username`() = runTest {
        assertThat(Rig(this, guest = guestSession()).controller.viewer.value).isEqualTo(SummaryViewer("p-9", null))
    }

    @Test
    fun `the agent summary arrives in the background, trimmed`() = runTest {
        val rig = Rig(this)
        rig.controller.refreshAgent()
        runCurrent()
        assertThat(rig.controller.agent.value).isEqualTo(LivingSummaryAgentState(text = "Un résumé", isRefreshing = false))
    }

    @Test
    fun `a guest never asks the server`() = runTest {
        val rig = Rig(this, guest = guestSession())
        rig.controller.refreshAgent()
        runCurrent()
        coVerify(exactly = 0) { rig.repository.fetchAnalysis(any()) }
        assertThat(rig.controller.agent.value.text).isNull()
    }

    @Test
    fun `an end to end conversation stays local, no server summary exists`() = runTest {
        val rig = Rig(this, encryptionMode = "e2ee")
        rig.controller.refreshAgent()
        runCurrent()
        coVerify(exactly = 0) { rig.repository.fetchAnalysis(any()) }
        assertThat(rig.controller.agent.value.text).isNull()
    }

    @Test
    fun `a failed analysis leaves the panel absent, without an error`() = runTest {
        val rig = Rig(this, result = NetworkResult.Failure(me.meeshy.sdk.net.ApiError("boom")))
        rig.controller.refreshAgent()
        runCurrent()
        assertThat(rig.controller.agent.value).isEqualTo(LivingSummaryAgentState())
    }
}
