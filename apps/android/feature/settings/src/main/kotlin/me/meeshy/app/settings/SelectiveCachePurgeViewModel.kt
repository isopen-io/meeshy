package me.meeshy.app.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.purge.CachePurgeService
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CachePurgeButtonState
import me.meeshy.sdk.model.mediacache.CachePurgeCellId
import me.meeshy.sdk.model.mediacache.CachePurgeReport
import me.meeshy.sdk.model.mediacache.CachePurgeSelection
import javax.inject.Inject

/**
 * État de l'écran Stockage (carte « Cache média » + purge sélective). [report] est `null` UNIQUEMENT avant la première
 * mesure (squelette) ; les mesures suivantes gardent l'ancien rapport visible (stale-while-revalidate).
 */
@Immutable
data class SelectiveCachePurgeUiState(
    val report: CachePurgeReport? = null,
    val isMeasuring: Boolean = false,
    val isPurging: Boolean = false,
    val selection: CachePurgeSelection = CachePurgeSelection(),
    val isConfirming: Boolean = false,
    val freedBytes: Long? = null,
    val purgeFailed: Boolean = false,
) {
    val hasSelection: Boolean get() = report?.let(selection::hasSelection) ?: false

    val button: CachePurgeButtonState
        get() = report?.let(selection::buttonState) ?: CachePurgeButtonState.NothingSelected

    val canPurge: Boolean get() = hasSelection && !isPurging
}

sealed interface SelectiveCachePurgeEvent {
    data object Appeared : SelectiveCachePurgeEvent
    data class ToggleCell(val id: CachePurgeCellId) : SelectiveCachePurgeEvent
    data class ToggleKind(val kind: CacheDataKind) : SelectiveCachePurgeEvent
    data object ToggleAll : SelectiveCachePurgeEvent
    data object ToggleUnattributed : SelectiveCachePurgeEvent
    data object RequestPurge : SelectiveCachePurgeEvent
    data object DismissConfirm : SelectiveCachePurgeEvent
    data object ConfirmPurge : SelectiveCachePurgeEvent
}

/**
 * Miroir de `CachePurgeViewModel` (iOS). Les demandes de mesure passent par un debounce de [MEASURE_DEBOUNCE_MILLIS] :
 * la mesure balaie les stockages disque et la base, et l'apparition de l'écran + le retour de purge arrivent en rafale.
 * La sélection ne contient jamais une case devenue vide ou indisponible après une mesure ; une seconde purge pendant
 * qu'une première tourne est ignorée.
 */
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
@HiltViewModel
class SelectiveCachePurgeViewModel @Inject constructor(
    private val service: CachePurgeService,
) : ViewModel() {

    private val _state = MutableStateFlow(SelectiveCachePurgeUiState())
    val state: StateFlow<SelectiveCachePurgeUiState> = _state.asStateFlow()

    private val measureRequests = Channel<Unit>(Channel.CONFLATED)

    init {
        measureRequests.receiveAsFlow().debounce(MEASURE_DEBOUNCE_MILLIS).onEach { measure() }.launchIn(viewModelScope)
    }

    fun onEvent(event: SelectiveCachePurgeEvent) {
        when (event) {
            SelectiveCachePurgeEvent.Appeared -> measureRequests.trySend(Unit)
            is SelectiveCachePurgeEvent.ToggleCell -> reduceSelection { sel, report -> sel.toggle(event.id, report) }
            is SelectiveCachePurgeEvent.ToggleKind -> reduceSelection { sel, report -> sel.toggleKind(event.kind, report) }
            SelectiveCachePurgeEvent.ToggleAll -> reduceSelection { sel, report -> sel.toggleEverything(report) }
            SelectiveCachePurgeEvent.ToggleUnattributed -> reduceSelection { sel, _ ->
                sel.withUnattributed(!sel.includeUnattributed)
            }
            SelectiveCachePurgeEvent.RequestPurge -> _state.update { if (it.canPurge) it.copy(isConfirming = true) else it }
            SelectiveCachePurgeEvent.DismissConfirm -> _state.update { it.copy(isConfirming = false) }
            SelectiveCachePurgeEvent.ConfirmPurge -> purge()
        }
    }

    private fun reduceSelection(block: (CachePurgeSelection, CachePurgeReport) -> CachePurgeSelection) {
        _state.update { current ->
            val report = current.report ?: return@update current
            current.copy(selection = block(current.selection, report))
        }
    }

    private suspend fun measure() {
        _state.update { it.copy(isMeasuring = true) }
        val fresh = try {
            service.report()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            _state.update { it.copy(isMeasuring = false) }
            return
        }
        _state.update { current ->
            val kept = current.selection.afterMeasure(fresh)
            current.copy(
                report = fresh,
                selection = if (fresh.unattributedBytes > 0L) kept else kept.withUnattributed(false),
                isMeasuring = false,
            )
        }
    }

    private fun purge() {
        val current = _state.value
        if (current.isPurging) return
        val selection = current.selection
        if (!current.hasSelection) {
            _state.update { it.copy(isConfirming = false) }
            return
        }
        _state.update { it.copy(isConfirming = false, isPurging = true, purgeFailed = false) }
        viewModelScope.launch {
            try {
                val result = service.purge(selection.ids, selection.includeUnattributed)
                _state.update {
                    it.copy(
                        selection = CachePurgeSelection(),
                        freedBytes = result.freedBytes,
                        isPurging = false,
                    )
                }
                measureRequests.trySend(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.update { it.copy(isPurging = false, purgeFailed = true) }
            }
        }
    }

    companion object {
        const val MEASURE_DEBOUNCE_MILLIS: Long = 120L
    }
}
