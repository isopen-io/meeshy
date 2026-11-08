package me.meeshy.app.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw
import me.meeshy.sdk.model.session.GeolocationAttribution
import me.meeshy.sdk.model.session.SessionRowPresentation
import me.meeshy.sdk.model.session.SessionsOrdering
import me.meeshy.sdk.model.session.UserSessionsPayload
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.UserSessionsRepository
import javax.inject.Inject

/** Ce qui a échoué, pour l'alerte d'erreur (iOS `showError`) : l'échec n'est plus silencieux. */
enum class ActiveSessionsFailure { REVOKE_ONE, REVOKE_OTHERS }

@Immutable
data class ActiveSessionsUiState(
    val mode: ActiveSessionsScreenLaw.Mode = ActiveSessionsScreenLaw.Mode.SKELETON,
    val banner: ActiveSessionsScreenLaw.Banner? = null,
    val current: SessionRowPresentation? = null,
    val others: List<SessionRowPresentation> = emptyList(),
    val showsGeolocation: Boolean = false,
    val attribution: GeolocationAttribution = GeolocationAttribution.DB_IP,
    val isRevoking: Boolean = false,
    val isRefreshing: Boolean = false,
    /** L'appareil dont la déconnexion attend un « oui » (iOS `pendingRevocation`). */
    val pendingRevocation: SessionRowPresentation? = null,
    val confirmingRevokeOthers: Boolean = false,
    val failure: ActiveSessionsFailure? = null,
)

sealed interface ActiveSessionsUiEvent {
    data object Retry : ActiveSessionsUiEvent
    data class RequestRevoke(val sessionId: String) : ActiveSessionsUiEvent
    data object ConfirmRevoke : ActiveSessionsUiEvent
    data object RequestRevokeOthers : ActiveSessionsUiEvent
    data object ConfirmRevokeOthers : ActiveSessionsUiEvent
    data object CancelConfirmation : ActiveSessionsUiEvent
    data object DismissFailure : ActiveSessionsUiEvent
}

sealed interface ActiveSessionsUiEffect {
    data object Success : ActiveSessionsUiEffect
    data object Error : ActiveSessionsUiEffect
}

/**
 * Sécurité > Sessions, cache-first (miroir d'`ActiveSessionsViewModel`, iOS) : la liste connue s'affiche aussitôt
 * et se revalide en silence, le squelette n'apparaît que sur un cache vide. La révocation passe d'abord par une
 * confirmation, retire la ligne tout de suite et la remet à son index si la passerelle refuse (le dépôt le fait).
 */
@HiltViewModel
class ActiveSessionsViewModel @Inject constructor(
    private val repository: UserSessionsRepository,
    private val network: NetworkMonitor,
    private val clock: CacheClock,
) : ViewModel() {

    private data class Local(
        val pendingId: String? = null,
        val confirmingOthers: Boolean = false,
        val isRevoking: Boolean = false,
        val isRefreshing: Boolean = false,
        val failure: ActiveSessionsFailure? = null,
    )

    private val local = MutableStateFlow(Local())
    private val effects = Channel<ActiveSessionsUiEffect>(Channel.BUFFERED)
    val effectFlow: Flow<ActiveSessionsUiEffect> = effects.receiveAsFlow()

    private val payload: Flow<UserSessionsPayload?> = repository.stream().map { result ->
        when (result) {
            is CacheResult.Fresh -> result.value
            is CacheResult.Stale -> result.value
            is CacheResult.Syncing -> result.value
            CacheResult.Empty -> null
        }
    }

    val state: StateFlow<ActiveSessionsUiState> = combine(
        payload,
        repository.syncFailure,
        network.isOnline,
        local,
    ) { served, syncFailure, online, local -> project(served, syncFailure != null, online, local) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), ActiveSessionsUiState())

    fun onEvent(event: ActiveSessionsUiEvent) {
        when (event) {
            ActiveSessionsUiEvent.Retry -> viewModelScope.launch { refresh() }
            is ActiveSessionsUiEvent.RequestRevoke -> requestRevoke(event.sessionId)
            ActiveSessionsUiEvent.ConfirmRevoke -> confirmRevoke()
            ActiveSessionsUiEvent.RequestRevokeOthers -> requestRevokeOthers()
            ActiveSessionsUiEvent.ConfirmRevokeOthers -> confirmRevokeOthers()
            ActiveSessionsUiEvent.CancelConfirmation ->
                local.update { it.copy(pendingId = null, confirmingOthers = false) }
            ActiveSessionsUiEvent.DismissFailure -> local.update { it.copy(failure = null) }
        }
    }

    /** Tirer pour actualiser : un échec reste dans le bandeau, il ne lève rien jusqu'à l'écran. */
    suspend fun refresh() {
        local.update { it.copy(isRefreshing = true) }
        try {
            repository.refresh()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Le dépôt a posé syncFailure : bandeau ou état d'erreur, jamais une exception d'écran.
        } finally {
            local.update { it.copy(isRefreshing = false) }
        }
    }

    private fun requestRevoke(sessionId: String) {
        if (state.value.others.none { it.id == sessionId }) return
        local.update { it.copy(pendingId = sessionId) }
    }

    private fun requestRevokeOthers() {
        if (state.value.others.isEmpty()) return
        local.update { it.copy(confirmingOthers = true) }
    }

    private fun confirmRevoke() {
        val id = local.value.pendingId ?: return
        if (!beginRevoking { it.copy(pendingId = null) }) return dismissIgnored()
        viewModelScope.launch { finish(repository.revoke(id), ActiveSessionsFailure.REVOKE_ONE) }
    }

    private fun confirmRevokeOthers() {
        if (!local.value.confirmingOthers) return
        if (!beginRevoking { it.copy(confirmingOthers = false) }) return dismissIgnored()
        viewModelScope.launch { finish(repository.revokeOthers(), ActiveSessionsFailure.REVOKE_OTHERS) }
    }

    private fun dismissIgnored() {
        local.update { it.copy(pendingId = null, confirmingOthers = false) }
    }

    /** Un seul retrait à la fois : un double toucher ne part pas deux fois. */
    private fun beginRevoking(transform: (Local) -> Local): Boolean {
        while (true) {
            val before = local.value
            if (before.isRevoking) return false
            if (local.compareAndSet(before, transform(before).copy(isRevoking = true))) return true
        }
    }

    private suspend fun finish(result: NetworkResult<Unit>, failure: ActiveSessionsFailure) {
        val ok = result is NetworkResult.Success
        local.update { it.copy(isRevoking = false, failure = if (ok) it.failure else failure) }
        effects.send(if (ok) ActiveSessionsUiEffect.Success else ActiveSessionsUiEffect.Error)
    }

    private fun project(
        served: UserSessionsPayload?,
        syncFailed: Boolean,
        online: Boolean,
        local: Local,
    ): ActiveSessionsUiState {
        val now = clock.nowMillis()
        val ordered = served?.let { SessionsOrdering.ordered(it.sessions) }.orEmpty()
        val rows = ordered.map { SessionRowPresentation.of(it, now) }
        return ActiveSessionsUiState(
            mode = ActiveSessionsScreenLaw.mode(served, syncFailed, online),
            banner = ActiveSessionsScreenLaw.banner(served, syncFailed, online),
            current = rows.firstOrNull { it.isCurrent },
            others = rows.filterNot { it.isCurrent },
            showsGeolocation = ActiveSessionsScreenLaw.showsGeolocation(ordered),
            attribution = served?.attribution ?: GeolocationAttribution.DB_IP,
            isRevoking = local.isRevoking,
            isRefreshing = local.isRefreshing,
            pendingRevocation = rows.firstOrNull { it.id == local.pendingId && !it.isCurrent },
            confirmingRevokeOthers = local.confirmingOthers,
            failure = local.failure,
        )
    }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
    }
}
