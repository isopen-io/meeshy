package me.meeshy.app.calls

import me.meeshy.feature.calls.R
import android.content.Context
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.CallAudioRouteState
import javax.inject.Inject

@Immutable
data class CallAudioRouteUiState(val route: CallAudioRouteState = CallAudioRouteState())

sealed interface CallAudioRouteUiEvent {
    /** La feuille (ou le bouton) apparaît : lit les routes et écoute leurs changements. */
    data class Start(val isVideo: Boolean) : CallAudioRouteUiEvent

    data class Select(val id: Int) : CallAudioRouteUiEvent

    data class BluetoothPermissionResult(val granted: Boolean) : CallAudioRouteUiEvent
}

/**
 * Miroir de `CallAudioRouteViewModel` (iOS) : lit la route, la tient à jour quand un périphérique
 * apparaît ou disparaît, et applique un choix en OPTIMISTE — l'état change tout de suite, la
 * plateforme confirme ensuite, un refus ramène l'état d'avant et le dit par un toast.
 */
@HiltViewModel
class CallAudioRouteViewModel @Inject constructor(
    private val service: CallAudioRouteProviding,
    private val bluetoothPermission: CallBluetoothPermission,
    private val toasts: CallToastBus,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(CallAudioRouteUiState())
    val state: StateFlow<CallAudioRouteUiState> = _state.asStateFlow()

    private var watching: Job? = null

    fun onEvent(event: CallAudioRouteUiEvent) {
        when (event) {
            is CallAudioRouteUiEvent.Start -> start(event.isVideo)
            is CallAudioRouteUiEvent.Select -> select(event.id)
            is CallAudioRouteUiEvent.BluetoothPermissionResult -> {
                _state.update { it.copy(route = it.route.copy(bluetoothPermitted = event.granted)) }
                refresh()
            }
        }
    }

    private fun start(isVideo: Boolean) {
        _state.update {
            it.copy(route = it.route.copy(isVideo = isVideo, bluetoothPermitted = bluetoothPermission.isGranted()))
        }
        refresh()
        if (watching?.isActive == true) return
        watching = service.routeChanges
            .onEach { refresh() }
            .catch { }
            .launchIn(viewModelScope)
    }

    private fun refresh() {
        val platform = service.snapshot()
        val next = _state.value.route.withRoutes(platform.routes, platform.activeId)
        _state.update { it.copy(route = next) }
        val resolved = next.activeId
        if (platform.activeId == null && resolved != null) service.select(resolved)
    }

    private fun select(id: Int) {
        val before = _state.value.route
        val optimistic = before.selecting(id)
        if (optimistic == before) return
        _state.update { it.copy(route = optimistic) }
        val accepted = try {
            service.select(id)
        } catch (_: RuntimeException) {
            false
        }
        if (accepted) return
        _state.update { it.copy(route = before) }
        toasts.error(context.getString(R.string.call_audio_select_failed))
    }
}
