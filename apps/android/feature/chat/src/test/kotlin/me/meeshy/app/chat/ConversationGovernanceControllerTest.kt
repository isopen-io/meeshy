package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/** Le rôle du lecteur dans le fil ouvert est servi par la gouvernance, jamais par un champ de [ChatUiState] (#15867). */
class ConversationGovernanceControllerTest {

    private class FakeHost(override val scope: CoroutineScope) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private val served = MutableStateFlow<ApiConversation?>(null)
    private val repository = mockk<ConversationRepository>(relaxed = true) {
        every { conversationStream(any()) } returns served
    }

    private fun session(userId: String?) = mockk<SessionRepository>(relaxed = true) {
        every { currentUser } returns MutableStateFlow(userId?.let { MeeshyUser(id = it, username = it) })
    }

    private fun conversation(role: String?, currentUserRole: String? = null) = ApiConversation(
        id = "c1",
        participants = role?.let { listOf(ApiParticipant(id = "pMe", userId = "me", role = it)) }.orEmpty(),
        currentUserRole = currentUserRole,
    )

    @Test
    fun `the reader role is unknown until the conversation is served`() = runTest {
        val controller = ConversationGovernanceController(repository, session("me")).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        assertThat(controller.viewerRole.value).isNull()
    }

    @Test
    fun `the reader role follows the served roster`() = runTest {
        val controller = ConversationGovernanceController(repository, session("me")).also { it.attach(FakeHost(backgroundScope)) }
        runCurrent()

        served.value = conversation(role = "moderator")
        runCurrent()

        assertThat(controller.viewerRole.value).isEqualTo("MODERATOR")
    }

    @Test
    fun `the gateway computed role wins over the roster`() = runTest {
        val controller = ConversationGovernanceController(repository, session("me")).also { it.attach(FakeHost(backgroundScope)) }
        served.value = conversation(role = "member", currentUserRole = "admin")
        runCurrent()

        assertThat(controller.viewerRole.value).isEqualTo("ADMIN")
    }

    @Test
    fun `a reader absent from the roster has no role, never a member fallback`() = runTest {
        val controller = ConversationGovernanceController(repository, session("me")).also { it.attach(FakeHost(backgroundScope)) }
        served.value = conversation(role = null)
        runCurrent()

        assertThat(controller.viewerRole.value).isNull()
    }
}
