package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallConversationChanged
import me.meeshy.sdk.model.call.CallLiveFrameSelected
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import org.junit.Test

/**
 * La conversation où vit l'appel (#19650) : posée par la configuration, déplacée par `call:conversation-changed`
 * vers le groupe des présents, et gardée jusqu'à la fin de CET appel — jamais au-delà.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallConversationBindingTest {

    private fun session(callId: String, conversationId: String = "direct-1") =
        CallSessionInfo(callId, CallConfig(peerId = "bob", peerName = "Bob", isVideo = false, isOutgoing = true, conversationId = conversationId))

    private fun changed(callId: String = "call-1", to: String = "group-1", from: String = "direct-1") = CallConversationChanged(
        callId = callId,
        conversationId = to,
        previousConversationId = from,
        conversationType = "group",
        conversationTitle = null,
        memberUserIds = listOf("me", "bob", "cleo"),
        created = true,
    )

    @Test
    fun `la bascule du meme appel deplace la conversation, celle d'un autre appel ne change rien`() {
        val bound = CallConversationBound(callId = "call-1", conversationId = "direct-1")

        assertThat(CallConversationSwitch.switched(bound, changed())).isEqualTo(
            CallConversationBound(callId = "call-1", conversationId = "group-1", originConversationId = "direct-1"),
        )
        assertThat(CallConversationSwitch.switched(bound, changed(callId = "call-2"))).isNull()
        assertThat(CallConversationSwitch.switched(CallConversationBound.NONE, changed(callId = ""))).isNull()
        assertThat(CallConversationSwitch.switched(bound, changed(to = "direct-1"))).isNull()
    }

    @Test
    fun `une transition du meme appel garde la bascule, un nouvel appel repart de sa configuration`() {
        val binding = CallConversationBinding()
        binding.bind(session("call-1"))
        assertThat(binding.apply(changed())).isTrue()

        binding.bind(session("call-1"))
        assertThat(binding.current).isEqualTo("group-1")
        assertThat(binding.conversationId.value).isEqualTo("group-1")

        binding.bind(session("call-2", conversationId = "direct-7"))
        assertThat(binding.current).isEqualTo("direct-7")
        assertThat(binding.apply(changed())).isFalse()
        assertThat(binding.current).isEqualTo("direct-7")
    }

    @Test
    fun `l'appel sortant qui recoit son identifiant garde sa conversation`() {
        val binding = CallConversationBinding()
        binding.bind(session(callId = ""))
        binding.bind(session(callId = "call-1"))
        assertThat(binding.apply(changed())).isTrue()
        assertThat(binding.bound.value.originConversationId).isEqualTo("direct-1")
    }

    @Test
    fun `le controleur lie l'appel, suit la bascule et oublie tout a la fin`() = runTest(UnconfinedTestDispatcher()) {
        val binding = CallConversationBinding()
        val changes = MutableSharedFlow<CallConversationChanged>(extraBufferCapacity = 4)
        val controller = CallConversationBindingController(binding, changes, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        assertThat(controller.order).isEqualTo(Int.MIN_VALUE)
        controller.onTransition(CallState.Idle, CallState.Connected, session("call-1"))
        changes.emit(changed())
        assertThat(binding.current).isEqualTo("group-1")

        controller.onTransition(CallState.Connected, CallState.Ended(me.meeshy.sdk.model.call.CallEndReason.Local), session("call-1"))
        assertThat(binding.current).isEmpty()
        changes.emit(changed())
        assertThat(binding.current).isEmpty()
    }

    @Test
    fun `l'enregistrement et le cadre en direct lisent la conversation basculee`() {
        val binding = CallConversationBinding()
        val host = CallRecordingCallHost(binding)
        binding.bind(session("call-1"))
        host.update("call-1", "direct-1", established = true)
        assertThat(host.conversationId).isEqualTo("direct-1")

        binding.apply(changed())
        assertThat(host.conversationId).isEqualTo("group-1")

        host.clear()
        assertThat(host.conversationId).isNull()
    }

    @Test
    fun `le cadre en direct resout ses textes dans la conversation basculee`() = runTest(UnconfinedTestDispatcher()) {
        val social = mockk<CallSocialSignalManager> {
            every { frameSelected } returns MutableSharedFlow<CallLiveFrameSelected>()
        }
        val account = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        }
        val binding = CallConversationBinding()
        val frame = CallLiveFrameController(social, account, CoroutineScope(UnconfinedTestDispatcher(testScheduler)), binding)

        frame.onTransition(CallState.Idle, CallState.Connected, session("call-1"))
        assertThat(frame.callContext().conversationId).isEqualTo("direct-1")

        binding.apply(changed())
        assertThat(frame.callContext().conversationId).isEqualTo("group-1")

        frame.onTransition(CallState.Connected, CallState.Ended(me.meeshy.sdk.model.call.CallEndReason.Local), session("call-1"))
        assertThat(frame.callContext().conversationId).isNull()
        frame.onCleared()
    }
}
