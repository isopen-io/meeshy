package me.meeshy.app.calls

import me.meeshy.feature.calls.R
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import javax.inject.Inject

/**
 * Le bouton « Sortie » posé au-dessus des commandes (slot [CallOverlaySlot.AboveControls]) : il
 * n'apparaît que quand un vrai choix existe (au moins deux sorties) et ouvre [CallAudioRouteSheet].
 */
class CallAudioRouteOverlay @Inject constructor() : CallOverlay {
    override val id: String = "call-audio-route"
    override val slot: CallOverlaySlot = CallOverlaySlot.AboveControls
    override val priority: Int = 10

    override fun isVisible(state: CallUiState): Boolean = state.canToggleMedia

    @Composable
    override fun Content(context: CallOverlayContext) {
        val viewModel: CallAudioRouteViewModel = hiltViewModel()
        val ui by viewModel.state.collectAsStateWithLifecycle()
        var open by remember { mutableStateOf(false) }
        val isVideo = context.state.isVideoCall
        LaunchedEffect(isVideo) { viewModel.onEvent(CallAudioRouteUiEvent.Start(isVideo)) }
        val route = ui.route
        if (!route.offersChoice && !route.bluetoothHidden) return
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { open = true }, modifier = Modifier.defaultMinSize(minHeight = 48.dp)) {
                route.active?.let { Icon(it.kind.icon(), contentDescription = null) }
                Text(stringResource(R.string.call_audio_button))
            }
        }
        if (open) {
            CallAudioRouteSheet(
                state = route,
                accent = context.accent,
                onSelect = { viewModel.onEvent(CallAudioRouteUiEvent.Select(it)) },
                onBluetoothPermission = { viewModel.onEvent(CallAudioRouteUiEvent.BluetoothPermissionResult(it)) },
                onDismiss = { open = false },
            )
        }
    }
}
