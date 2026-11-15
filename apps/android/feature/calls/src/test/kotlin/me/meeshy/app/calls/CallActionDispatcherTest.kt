package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

/**
 * Behavioural spec of the controls extension point: an action with a handler is
 * offered and runs on tap, an action without one is simply absent, and one
 * handler never affects another.
 */
class CallActionDispatcherTest {

    private class FakeHandler(
        private val shownWhen: (CallUiState) -> Boolean = { true },
        private val active: Boolean = false,
        private val failsWith: RuntimeException? = null,
    ) : CallActionHandler {
        var performed = 0
            private set

        override fun present(state: CallUiState): CallActionPresentation? =
            if (shownWhen(state)) CallActionPresentation(Icons.Filled.Call, labelRes = 1, isActive = active) else null

        override fun perform() {
            performed += 1
            failsWith?.let { throw it }
        }
    }

    private val config = CallConfig(peerId = "peer", peerName = "Alice", isVideo = true, isOutgoing = true)

    private fun state(callState: CallState = CallState.Connected) =
        CallPresenter.present(callState, config, CallMedia())

    private fun dispatcherOf(vararg handlers: Pair<CallAction, CallActionHandler>) =
        CallActionDispatcher(handlers.toMap())

    @Test
    fun `a registered action is executed by the dispatcher`() {
        val screenShare = FakeHandler()
        val dispatcher = dispatcherOf(CallAction.ScreenShare to screenShare)

        val ran = dispatcher.dispatch(CallAction.ScreenShare)

        assertThat(ran).isTrue()
        assertThat(screenShare.performed).isEqualTo(1)
    }

    @Test
    fun `an action without a handler runs nothing and says so`() {
        val screenShare = FakeHandler()
        val dispatcher = dispatcherOf(CallAction.ScreenShare to screenShare)

        val ran = dispatcher.dispatch(CallAction.Recording)

        assertThat(ran).isFalse()
        assertThat(screenShare.performed).isEqualTo(0)
        assertThat(dispatcher.isRegistered(CallAction.Recording)).isFalse()
        assertThat(dispatcher.isRegistered(CallAction.ScreenShare)).isTrue()
    }

    @Test
    fun `an action without a handler is hidden from the controls`() {
        val dispatcher = dispatcherOf(CallAction.Captions to FakeHandler())

        val offered = dispatcher.offered(state()).map { it.action }

        assertThat(offered).containsExactly(CallAction.Captions)
    }

    @Test
    fun `with nothing registered no action is offered`() {
        assertThat(dispatcherOf().offered(state())).isEmpty()
    }

    @Test
    fun `a handler can decline to show its action for this snapshot of the call`() {
        val connectedOnly = FakeHandler(shownWhen = { it.status == CallStatus.CONNECTED })
        val dispatcher = dispatcherOf(CallAction.React to connectedOnly)

        assertThat(dispatcher.offered(state(CallState.Connected))).hasSize(1)
        assertThat(dispatcher.offered(state(CallState.Connecting))).isEmpty()
    }

    @Test
    fun `offered actions follow the vocabulary order, not the registration order`() {
        val dispatcher = dispatcherOf(
            CallAction.Journal to FakeHandler(),
            CallAction.Effects to FakeHandler(),
            CallAction.Captions to FakeHandler(),
        )

        val offered = dispatcher.offered(state()).map { it.action }

        assertThat(offered).containsExactly(CallAction.Effects, CallAction.Captions, CallAction.Journal).inOrder()
    }

    @Test
    fun `the offered actions can be narrowed to one family`() {
        val dispatcher = dispatcherOf(
            CallAction.Effects to FakeHandler(),
            CallAction.Captions to FakeHandler(),
        )

        assertThat(dispatcher.offered(state(), CallActionFamily.MyImage).map { it.action })
            .containsExactly(CallAction.Effects)
        assertThat(dispatcher.offered(state(), CallActionFamily.TheCall).map { it.action })
            .containsExactly(CallAction.Captions)
    }

    @Test
    fun `the presentation carries the active flag of a toggle that is on`() {
        val dispatcher = dispatcherOf(CallAction.Recording to FakeHandler(active = true))

        assertThat(dispatcher.offered(state()).single().presentation.isActive).isTrue()
    }

    @Test
    fun `dispatching twice runs the handler twice - the dispatcher adds no debounce of its own`() {
        val react = FakeHandler()
        val dispatcher = dispatcherOf(CallAction.React to react)

        dispatcher.dispatch(CallAction.React)
        dispatcher.dispatch(CallAction.React)

        assertThat(react.performed).isEqualTo(2)
    }

    @Test
    fun `one handler never affects another`() {
        val react = FakeHandler()
        val journal = FakeHandler()
        val dispatcher = dispatcherOf(CallAction.React to react, CallAction.Journal to journal)

        dispatcher.dispatch(CallAction.Journal)

        assertThat(react.performed).isEqualTo(0)
        assertThat(journal.performed).isEqualTo(1)
    }

    @Test
    fun `a handler that throws is contained - the dispatcher reports it did not run`() {
        val broken = FakeHandler(failsWith = IllegalStateException("boom"))
        val dispatcher = dispatcherOf(CallAction.Capture to broken)

        val ran = dispatcher.dispatch(CallAction.Capture)

        assertThat(ran).isFalse()
        assertThat(broken.performed).isEqualTo(1)
    }

    @Test
    fun `a handler that cannot present itself is hidden, never a crash`() {
        val broken = object : CallActionHandler {
            override fun present(state: CallUiState): CallActionPresentation? = error("boom")
            override fun perform() = Unit
        }
        val dispatcher = dispatcherOf(CallAction.Capture to broken, CallAction.Captions to FakeHandler())

        assertThat(dispatcher.offered(state()).map { it.action }).containsExactly(CallAction.Captions)
    }
}
