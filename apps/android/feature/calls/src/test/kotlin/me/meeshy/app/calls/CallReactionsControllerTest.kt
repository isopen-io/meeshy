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
import me.meeshy.sdk.model.call.CallReactionEmoji
import me.meeshy.sdk.model.call.CallReactionReceived
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallReactionsControllerTest {
    private val incoming = MutableSharedFlow<CallReactionReceived>(extraBufferCapacity = 8)
    private val social = mockk<CallSocialSignalManager> {
        every { reactionReceived } returns incoming
        coEvery { sendCallReaction(any(), any()) } returns Result.success(Unit)
    }
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
    }
    private val info = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY)

    private fun TestScopeController(scope: CoroutineScope) = CallReactionsController(social, session, scope)

    private fun runTestController(block: suspend (CallReactionsController) -> Unit) = runTest {
        val controller = TestScopeController(CoroutineScope(UnconfinedTestDispatcher(testScheduler)))
        block(controller)
        controller.onCleared()
    }

    @Test
    fun `sans identifiant d'appel, une reaction n'est ni montree ni envoyee`() = runTestController { controller ->
        assertThat(controller.react(CallReactionEmoji.HEART)).isFalse()
        assertThat(controller.floating.value).isEmpty()
        coVerify(exactly = 0) { social.sendCallReaction(any(), any()) }
    }

    @Test
    fun `une reaction locale monte aussitot et part vers l'appel`() = runTestController { controller ->
        controller.onTransition(CallState.Idle, CallState.Connected, info)

        assertThat(controller.react(CallReactionEmoji.FIRE)).isTrue()

        assertThat(controller.floating.value.map { it.emoji }).containsExactly(CallReactionEmoji.FIRE)
        coVerify(exactly = 1) { social.sendCallReaction("call-1", CallReactionEmoji.FIRE) }
    }

    @Test
    fun `la reaction d'un autre participant monte, la sienne rejouee par le serveur et celles d'un autre appel non`() =
        runTestController { controller ->
            controller.onTransition(CallState.Idle, CallState.Connected, info)

            incoming.tryEmit(CallReactionReceived("call-1", "peer", CallReactionEmoji.CLAP))
            incoming.tryEmit(CallReactionReceived("call-1", "me", CallReactionEmoji.WOW))
            incoming.tryEmit(CallReactionReceived("call-2", "peer", CallReactionEmoji.SAD))

            assertThat(controller.floating.value.map { it.emoji }).containsExactly(CallReactionEmoji.CLAP)
        }

    @Test
    fun `les emojis se repartissent sur les voies et un emoji fini est retire`() = runTestController { controller ->
        controller.onTransition(CallState.Idle, CallState.Connected, info)
        controller.react(CallReactionEmoji.HEART)
        controller.react(CallReactionEmoji.LAUGH)

        val (first, second) = controller.floating.value
        assertThat(first.lane).isNotEqualTo(second.lane)

        controller.finished(first.id)
        assertThat(controller.floating.value).containsExactly(second)
    }

    @Test
    fun `la fin de l'appel vide le ciel et coupe l'ecoute`() = runTestController { controller ->
        controller.onTransition(CallState.Idle, CallState.Connected, info)
        controller.react(CallReactionEmoji.HEART)

        controller.onTransition(CallState.Connected, CallState.Idle, info)
        incoming.tryEmit(CallReactionReceived("call-1", "peer", CallReactionEmoji.CLAP))

        assertThat(controller.floating.value).isEmpty()
        assertThat(controller.react(CallReactionEmoji.HEART)).isFalse()
    }
}
