package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameSelected
import me.meeshy.sdk.model.call.CallLiveFrameTexts
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.frames.CallLiveFrameProposal
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallLiveFrameControllerTest {
    private val incoming = MutableSharedFlow<CallLiveFrameSelected>(extraBufferCapacity = 8)
    private val social = mockk<CallSocialSignalManager> {
        every { frameSelected } returns incoming
        coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
    }
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "ana", displayName = "Ana"))
    }
    private val info = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY)
    private val frame = "elegant.classic.duo"
    private val other = "futuriste.neon.duo"

    private fun run(block: suspend (CallLiveFrameController) -> Unit) = runTest {
        val controller = CallLiveFrameController(social, session, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))
        controller.onTransition(CallState.Idle, CallState.Connected, info)
        block(controller)
        controller.onCleared()
    }

    @Test
    fun `mon cadre part comme une proposition avec mon prenom, sur le canal d'iOS`() = run { controller ->
        controller.apply(frame)

        assertThat(controller.state.value.frameId).isEqualTo(frame)
        coVerify(exactly = 1) { social.selectCallLiveFrame("call-1", frame, CallLiveFrameTexts(name = "Ana"), null) }
    }

    @Test
    fun `une proposition recue attend mon choix, accepter l'applique et repond`() = run { controller ->
        incoming.tryEmit(CallLiveFrameSelected("call-1", "peer", other, CallLiveFrameTexts(name = "Bob")))
        assertThat(controller.state.value.proposal).isEqualTo(CallLiveFrameProposal(other, "Bob"))
        assertThat(controller.state.value.frameId).isNull()

        controller.accept()

        assertThat(controller.state.value.frameId).isEqualTo(other)
        coVerify { social.selectCallLiveFrame("call-1", other, CallLiveFrameTexts(name = "Ana"), CallLiveFrameReply.ACCEPTED) }
    }

    @Test
    fun `refuser garde mon affichage et le dit a l'autre`() = run { controller ->
        incoming.tryEmit(CallLiveFrameSelected("call-1", "peer", other, null))
        controller.decline()

        assertThat(controller.state.value.frameId).isNull()
        assertThat(controller.state.value.proposal).isNull()
        coVerify { social.selectCallLiveFrame("call-1", other, any(), CallLiveFrameReply.DECLINED) }
    }

    @Test
    fun `un refus de la passerelle garde le cadre chez moi et le dit`() = run { controller ->
        coEvery { social.selectCallLiveFrame(any(), any(), any(), any()) } returns Result.failure(IllegalStateException("refus"))
        controller.apply(frame)

        assertThat(controller.state.value.frameId).isEqualTo(frame)
        assertThat(controller.state.value.sentProposal).isNull()
        assertThat(controller.notices.value).isEqualTo(CallLiveFrameNotice.NotProposed)
    }

    @Test
    fun `un refus arrive apres que j'ai retire ma proposition ne dit rien`() = runTest {
        val gate = kotlinx.coroutines.CompletableDeferred<Result<Unit>>()
        coEvery { social.selectCallLiveFrame(any(), frame, any(), null) } coAnswers { gate.await() }
        val controller = CallLiveFrameController(social, session, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))
        controller.onTransition(CallState.Idle, CallState.Connected, info)

        controller.apply(frame)
        controller.apply(null)
        gate.complete(Result.failure(IllegalStateException("refus")))

        assertThat(controller.notices.value).isNull()
        assertThat(controller.state.value.frameId).isNull()
        controller.onCleared()
    }

    @Test
    fun `sans appel identifie, choisir un cadre ne change rien, comme iOS`() = runTest {
        val controller = CallLiveFrameController(social, session, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))
        controller.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo(callId = "", config = CallConfig.EMPTY))

        controller.apply(frame)

        assertThat(controller.state.value.frameId).isNull()
        coVerify(exactly = 0) { social.selectCallLiveFrame(any(), any(), any(), any()) }
        controller.onCleared()
    }

    @Test
    fun `la reponse de l'autre a ma proposition s'affiche`() = run { controller ->
        controller.apply(frame)
        incoming.tryEmit(CallLiveFrameSelected("call-1", "peer", frame, CallLiveFrameTexts(name = "Bob"), CallLiveFrameReply.ACCEPTED))

        assertThat(controller.state.value.answer?.reply).isEqualTo(CallLiveFrameReply.ACCEPTED)
        controller.dismissAnswer()
        assertThat(controller.state.value.answer).isNull()
    }

    @Test
    fun `un evenement d'un autre appel est ignore, et la fin de l'appel efface le cadre`() = run { controller ->
        incoming.tryEmit(CallLiveFrameSelected("call-2", "peer", other, null))
        assertThat(controller.state.value.proposal).isNull()

        controller.apply(frame)
        controller.onTransition(CallState.Connected, CallState.Idle, info)
        assertThat(controller.state.value.frameId).isNull()
    }

    @Test
    fun `les deux personnes du duo prennent le prenom que l'autre partage`() = run { controller ->
        val people = controller.people("Robert", "Bob")
        assertThat(people.map { it.name }).containsExactly("Ana", "Bob").inOrder()
        assertThat(people.map { it.isSelf }).containsExactly(true, false).inOrder()
    }
}
