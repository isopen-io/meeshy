package me.meeshy.app.calls

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.call.CallQualityStatsFeed
import me.meeshy.sdk.model.call.CallQualityGrade
import me.meeshy.sdk.model.call.CallQualityNetworkContext
import me.meeshy.sdk.model.call.CallQualityReading
import me.meeshy.sdk.model.call.CallQualityRow
import me.meeshy.sdk.model.call.CallQualityRows
import javax.inject.Inject

/** Ce que la feuille « Qualité de l'appel » montre ; vide tant que la première lecture n'est pas arrivée. */
@Immutable
data class CallQualityDetailUiState(
    val rows: List<CallQualityRow> = emptyList(),
    val network: CallQualityNetworkContext? = null,
) {
    val overall: CallQualityGrade? get() = CallQualityRows.overall(rows)
    val isWaitingForFirstReading: Boolean get() = rows.isEmpty()
}

sealed interface CallQualityDetailUiEvent {
    /** La feuille apparaît : abonnement aux lectures en direct. */
    data object Start : CallQualityDetailUiEvent

    /** La feuille disparaît : l'abonnement est coupé, plus aucune mise à jour ne court. */
    data object Stop : CallQualityDetailUiEvent
}

/** Miroir de iOS `CallQualityDetailViewModel` : projette les lectures du relais sur les rangées de la feuille. */
@HiltViewModel
class CallQualityDetailViewModel @Inject constructor(
    private val feed: CallQualityStatsFeed,
) : ViewModel() {
    private val _state = MutableStateFlow(CallQualityDetailUiState())
    val state: StateFlow<CallQualityDetailUiState> = _state.asStateFlow()

    private var subscription: Job? = null

    fun onEvent(event: CallQualityDetailUiEvent) {
        when (event) {
            CallQualityDetailUiEvent.Start -> start()
            CallQualityDetailUiEvent.Stop -> stop()
        }
    }

    private fun start() {
        if (subscription?.isActive == true) return
        subscription = feed.readings
            .onEach(::project)
            .catch { }
            .launchIn(viewModelScope)
    }

    private fun stop() {
        subscription?.cancel()
        subscription = null
    }

    private fun project(reading: CallQualityReading?) {
        val next = CallQualityDetailUiState(
            rows = CallQualityRows.rows(reading),
            network = CallQualityNetworkContext.from(reading),
        )
        if (next != _state.value) _state.value = next
    }
}
