package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.CallActionSet
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallScreenPanel

/** What the call chrome remembers: the one open layer, whether a tap hid it, and the fingers on it. */
internal data class CallChromeState(
    val layer: CallScreenLayer = CallScreenLayer.Idle,
    val isRevealed: Boolean = true,
    val fingersDown: Int = 0,
    val hiddenAtMillis: Long? = null,
)

/**
 * The state of the call chrome (header, pill, panels): which layer is open and whether a tap on
 * the video scene hid it. Every rule is the shared [CallScreenLayer] / [CallChromeVisibility] law;
 * this class only holds the current value. Mirrors the `layer` / `showControls` state of iOS
 * `CallView`.
 */
internal class CallChromeController(private val clock: () -> Long = System::currentTimeMillis) {

    private val _state = MutableStateFlow(CallChromeState())
    val state: StateFlow<CallChromeState> = _state.asStateFlow()

    fun visibility(isVideoStage: Boolean, isTouchExplorationOn: Boolean): CallChromeVisibility {
        val current = _state.value
        val mayHide = CallChromeVisibility.mayToggleByTap(isVideoStage, isTouchExplorationOn)
        return CallChromeVisibility(
            isRevealed = current.isRevealed || !mayHide,
            isStageFullScreen = false,
            isModeActive = current.layer.freesTheScreen,
        )
    }

    /** During the fade-out the hidden chrome is still seen, so it still answers; after it, it does not. */
    fun acceptsTouches(isVideoStage: Boolean, isTouchExplorationOn: Boolean): Boolean {
        val current = _state.value
        val visible = visibility(isVideoStage, isTouchExplorationOn).isVisible(CallChromeElement.Controls)
        val hiddenFor = current.hiddenAtMillis?.let { clock() - it } ?: 0L
        return CallChromeVisibility.acceptsTouches(visible, hiddenFor)
    }

    fun onSceneTap(isVideoStage: Boolean, isTouchExplorationOn: Boolean) {
        if (!CallChromeVisibility.mayToggleByTap(isVideoStage, isTouchExplorationOn)) return
        _state.update { if (it.isRevealed) it.hidden(clock()) else it.revealed() }
    }

    fun onInteraction(interaction: CallChromeInteraction) {
        _state.update {
            when (interaction) {
                CallChromeInteraction.Revive -> if (it.isRevealed) it else it.revealed()
                CallChromeInteraction.TouchBegan -> it.copy(fingersDown = it.fingersDown + 1)
                CallChromeInteraction.TouchEnded -> it.copy(fingersDown = (it.fingersDown - 1).coerceAtLeast(0))
                CallChromeInteraction.Tap -> it
            }
        }
    }

    fun toggleMenu() = update { it.togglingMenu() }

    fun open(panel: CallScreenPanel) = update { it.opening(panel) }

    fun backToMenu() = update { it.backToMenu() }

    fun close() = update { it.closed() }

    fun enter(mode: CallScreenMode) {
        _state.update { it.revealed().copy(layer = it.layer.entering(mode)) }
    }

    fun exitMode() = update { it.exitingMode() }

    fun reconcile(actions: CallActionSet) = update { it.reconciled(actions) }

    private fun update(transform: (CallScreenLayer) -> CallScreenLayer) {
        _state.update { it.copy(layer = transform(it.layer)) }
    }

    private fun CallChromeState.hidden(now: Long) = copy(isRevealed = false, hiddenAtMillis = now)

    private fun CallChromeState.revealed() = copy(isRevealed = true, hiddenAtMillis = null)
}
