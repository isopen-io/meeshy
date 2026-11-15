package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

/**
 * Behavioural spec of the logic extension point: a capability's controller is told
 * of every transition and remote event, in a deterministic order, and one that
 * misbehaves never takes the call (or the controllers after it) down.
 */
class CallFeatureControllerRegistryTest {

    private val session = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY)

    private class RecordingController(
        private val journal: MutableList<String>,
        private val name: String,
        override val order: Int = 0,
        private val failsWith: RuntimeException? = null,
    ) : CallFeatureController {
        override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
            journal += "$name:transition:${previous::class.simpleName}->${next::class.simpleName}:${session.callId}"
            failsWith?.let { throw it }
        }

        override fun onRemoteEvent(event: CallEvent, session: CallSessionInfo) {
            journal += "$name:event:${event::class.simpleName}"
            failsWith?.let { throw it }
        }

        override fun onCleared() {
            journal += "$name:cleared"
            failsWith?.let { throw it }
        }
    }

    private fun registryOf(vararg controllers: CallFeatureController) =
        CallFeatureControllerRegistry(controllers.toSet())

    @Test
    fun `a controller receives the phase it left, the phase it entered and the call`() {
        val journal = mutableListOf<String>()
        val registry = registryOf(RecordingController(journal, "a"))

        registry.notifyTransition(CallState.Connecting, CallState.Connected, session)

        assertThat(journal).containsExactly("a:transition:Connecting->Connected:call-1")
    }

    @Test
    fun `a controller receives every remote event`() {
        val journal = mutableListOf<String>()
        val registry = registryOf(RecordingController(journal, "a"))

        registry.notifyRemoteEvent(CallEvent.RemoteAnswer, session)
        registry.notifyRemoteEvent(CallEvent.RemoteHangUp, session)

        assertThat(journal).containsExactly("a:event:RemoteAnswer", "a:event:RemoteHangUp").inOrder()
    }

    @Test
    fun `controllers are called by ascending order whatever the registration order`() {
        val journal = mutableListOf<String>()
        val registry = registryOf(
            RecordingController(journal, "late", order = 10),
            RecordingController(journal, "first", order = -5),
            RecordingController(journal, "middle", order = 0),
        )

        registry.notifyRemoteEvent(CallEvent.MediaConnected, session)

        assertThat(journal)
            .containsExactly("first:event:MediaConnected", "middle:event:MediaConnected", "late:event:MediaConnected")
            .inOrder()
    }

    @Test
    fun `controllers with the same order keep their registration order`() {
        val journal = mutableListOf<String>()
        val registry = registryOf(
            RecordingController(journal, "one"),
            RecordingController(journal, "two"),
            RecordingController(journal, "three"),
        )

        registry.notifyCleared()

        assertThat(journal).containsExactly("one:cleared", "two:cleared", "three:cleared").inOrder()
    }

    @Test
    fun `a controller that throws is isolated - the ones after it are still called`() {
        val journal = mutableListOf<String>()
        val registry = registryOf(
            RecordingController(journal, "before", order = 0),
            RecordingController(journal, "broken", order = 1, failsWith = IllegalStateException("boom")),
            RecordingController(journal, "after", order = 2),
        )

        registry.notifyTransition(CallState.Idle, CallState.Ringing(isOutgoing = true), session)
        registry.notifyRemoteEvent(CallEvent.ParticipantJoined(), session)
        registry.notifyCleared()

        assertThat(journal.filter { it.startsWith("before") }).hasSize(3)
        assertThat(journal.filter { it.startsWith("broken") }).hasSize(3)
        assertThat(journal.filter { it.startsWith("after") }).hasSize(3)
    }

    @Test
    fun `a registry with nothing registered is inert`() {
        val registry = registryOf()

        registry.notifyTransition(CallState.Idle, CallState.Connected, session)
        registry.notifyRemoteEvent(CallEvent.RemoteHangUp, session)
        registry.notifyCleared()
    }

    @Test
    fun `a controller that overrides nothing is a valid controller`() {
        val registry = registryOf(object : CallFeatureController {})

        registry.notifyTransition(CallState.Idle, CallState.Connected, session)
        registry.notifyRemoteEvent(CallEvent.RemoteHangUp, session)
        registry.notifyCleared()
    }
}
