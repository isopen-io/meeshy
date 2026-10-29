package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionSet
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallScreenPanel

/**
 * What the call offers right now and what a tap does — read ONCE by the screen, shared by the pill and by the
 * controls of my image around my tile (Effets), so the two never disagree on an action.
 */
internal class CallPillActions(
    val items: Map<CallAction, CallPillItem>,
    val available: CallActionSet,
    val onAction: (CallAction) -> Unit,
)

@Composable
internal fun rememberCallPillActions(
    state: CallUiState,
    viewModel: CallViewModel,
    chrome: CallChromeController,
): CallPillActions {
    val dispatcher = viewModel.extensions.actions
    val recordingViewModel: CallRecordingViewModel = hiltViewModel()
    val recording by recordingViewModel.state.collectAsStateWithLifecycle()
    val offered = remember(state, recording) { dispatcher.offered(state) }
    val items = remember(state, offered) { CallPillModel.items(state, offered) }
    val available = remember(state, items) { CallPillModel.available(state, items, dispatcher::isRegistered) }
    val isRecording = recording.phase.isActive
    val onAction: (CallAction) -> Unit = remember(viewModel, chrome, isRecording) {
        { action ->
            val stopsRecording = action == CallAction.Recording && isRecording
            CallScreenPanel.entries.firstOrNull { it.action == action && !stopsRecording }?.let(chrome::open)
            CallScreenMode.entries.firstOrNull { it.action == action }?.let(chrome::enter)
            when (action) {
                CallAction.Camera -> viewModel.toggleCamera()
                CallAction.FlipCamera -> viewModel.flipCamera()
                else -> dispatcher.dispatch(action)
            }
        }
    }
    return remember(items, available, onAction) { CallPillActions(items, available, onAction) }
}
