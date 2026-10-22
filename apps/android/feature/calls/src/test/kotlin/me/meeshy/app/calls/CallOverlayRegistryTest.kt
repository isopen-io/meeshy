package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

/**
 * Behavioural spec of the UI extension point: which overlays are on screen in a
 * slot, in which order, and when a higher-priority one replaces the others.
 */
class CallOverlayRegistryTest {

    private class FakeOverlay(
        override val id: String,
        override val slot: CallOverlaySlot,
        override val priority: Int = 0,
        private val visibleWhen: (CallUiState) -> Boolean = { true },
    ) : CallOverlay {
        override fun isVisible(state: CallUiState): Boolean = visibleWhen(state)

        @Composable
        override fun Content(context: CallOverlayContext) = Unit
    }

    private fun stateOf(
        callState: CallState = CallState.Connected,
        config: CallConfig = CallConfig("peer", "Alice", isVideo = false, isOutgoing = true),
    ): CallUiState = CallPresenter.present(callState, config, CallMedia())

    private fun registryOf(vararg overlays: CallOverlay) = CallOverlayRegistry(overlays.toSet())

    private fun CallOverlayRegistry.ids(slot: CallOverlaySlot, state: CallUiState = stateOf()) =
        visible(slot, state).map { it.id }

    @Test
    fun `an overlay appears in its own slot and in no other`() {
        val registry = registryOf(FakeOverlay("notice", CallOverlaySlot.TopBanner))

        assertThat(registry.ids(CallOverlaySlot.TopBanner)).containsExactly("notice")
        assertThat(registry.ids(CallOverlaySlot.Center)).isEmpty()
        assertThat(registry.ids(CallOverlaySlot.Panel)).isEmpty()
    }

    @Test
    fun `a stacking slot shows every visible overlay, the highest priority first`() {
        val registry = registryOf(
            FakeOverlay("low", CallOverlaySlot.TopBanner, priority = 1),
            FakeOverlay("high", CallOverlaySlot.TopBanner, priority = 9),
            FakeOverlay("mid", CallOverlaySlot.TopBanner, priority = 5),
        )

        assertThat(registry.ids(CallOverlaySlot.TopBanner)).containsExactly("high", "mid", "low").inOrder()
    }

    @Test
    fun `equal priorities fall back to the id so the order never depends on registration`() {
        val registry = registryOf(
            FakeOverlay("b", CallOverlaySlot.TopBanner),
            FakeOverlay("c", CallOverlaySlot.TopBanner),
            FakeOverlay("a", CallOverlaySlot.TopBanner),
        )

        assertThat(registry.ids(CallOverlaySlot.TopBanner)).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `a replacing slot shows only the highest-priority visible overlay`() {
        val registry = registryOf(
            FakeOverlay("people", CallOverlaySlot.Panel, priority = 1),
            FakeOverlay("reactions", CallOverlaySlot.Panel, priority = 2),
        )

        assertThat(registry.ids(CallOverlaySlot.Panel)).containsExactly("reactions")
    }

    @Test
    fun `a higher-priority overlay replaces a lower one only while it is visible`() {
        val registry = registryOf(
            FakeOverlay("people", CallOverlaySlot.Panel, priority = 1),
            FakeOverlay("urgent", CallOverlaySlot.Panel, priority = 9) { it.status == CallStatus.RECONNECTING },
        )

        assertThat(registry.ids(CallOverlaySlot.Panel, stateOf(CallState.Connected))).containsExactly("people")
        assertThat(registry.ids(CallOverlaySlot.Panel, stateOf(CallState.Reconnecting(attempt = 1))))
            .containsExactly("urgent")
        assertThat(registry.ids(CallOverlaySlot.Panel, stateOf(CallState.Connected))).containsExactly("people")
    }

    @Test
    fun `an overlay that is not visible for the snapshot is left out`() {
        val registry = registryOf(
            FakeOverlay("video-only", CallOverlaySlot.Center) { it.isVideoCall },
            FakeOverlay("always", CallOverlaySlot.Center),
        )

        val audio = stateOf(config = CallConfig("peer", "Alice", isVideo = false, isOutgoing = true))
        val video = stateOf(config = CallConfig("peer", "Alice", isVideo = true, isOutgoing = true))

        assertThat(registry.ids(CallOverlaySlot.Center, audio)).containsExactly("always")
        assertThat(registry.ids(CallOverlaySlot.Center, video)).containsExactly("always", "video-only").inOrder()
    }

    @Test
    fun `an overlay that cannot decide its visibility is hidden, never a crash`() {
        val registry = registryOf(
            FakeOverlay("broken", CallOverlaySlot.Center, priority = 9) { error("boom") },
            FakeOverlay("fine", CallOverlaySlot.Center),
        )

        assertThat(registry.ids(CallOverlaySlot.Center)).containsExactly("fine")
    }

    @Test
    fun `only the panel and the fullscreen layers replace, the others stack`() {
        val replacing = CallOverlaySlot.entries.filter { it.replacing }

        assertThat(replacing).containsExactly(CallOverlaySlot.Panel, CallOverlaySlot.Fullscreen)
    }

    @Test
    fun `a registry with nothing registered shows nothing in any slot`() {
        val registry = registryOf()

        CallOverlaySlot.entries.forEach { slot -> assertThat(registry.ids(slot)).isEmpty() }
    }
}
