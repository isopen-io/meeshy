package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.e2ee.OwnEncryptedDevicesProviding
import me.meeshy.sdk.model.e2ee.OwnEncryptedDevice
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Pourquoi la passerelle n'a pas répondu : hors ligne se dit autrement qu'une panne. */
enum class EncryptedDevicesFailure { OFFLINE, UNAVAILABLE }

data class EncryptedDevicesUiState(
    /** `null` tant qu'aucune liste n'a été confirmée pour ce compte (démarrage à froid). */
    val devices: List<OwnEncryptedDevice>? = null,
    val isRefreshing: Boolean = false,
    val loadFailure: EncryptedDevicesFailure? = null,
    val retiringIds: Set<Int> = emptySet(),
    /** L'appareil dont le retrait attend un « oui » explicite. */
    val pendingRetirement: OwnEncryptedDevice? = null,
    val retireFailure: EncryptedDevicesFailure? = null,
)

/** Ce que l'écran rend, dérivé de l'état et de lui seul. */
sealed interface EncryptedDevicesContent {
    data object Loading : EncryptedDevicesContent
    data class Unreachable(val failure: EncryptedDevicesFailure) : EncryptedDevicesContent
    data class Empty(val staleBecause: EncryptedDevicesFailure?) : EncryptedDevicesContent
    data class Listed(
        val devices: List<OwnEncryptedDevice>,
        val staleBecause: EncryptedDevicesFailure?,
    ) : EncryptedDevicesContent
}

fun EncryptedDevicesUiState.content(): EncryptedDevicesContent {
    val listed = devices
    return when {
        listed == null && loadFailure != null && !isRefreshing -> EncryptedDevicesContent.Unreachable(loadFailure)
        listed == null -> EncryptedDevicesContent.Loading
        listed.isEmpty() -> EncryptedDevicesContent.Empty(loadFailure)
        else -> EncryptedDevicesContent.Listed(listed, loadFailure)
    }
}

/**
 * Réglages › Sécurité › « Mes appareils chiffrés » (#13014). La dernière liste s'affiche sans
 * attente et se relit en silence. Le retrait d'un appareil RÉVOQUE son identité : il se demande,
 * puis se confirme, et l'appareil ne quitte la liste qu'une fois la passerelle d'accord — pour une
 * mesure de sécurité, l'écran ne promet jamais ce que le serveur n'a pas fait.
 */
@HiltViewModel
class EncryptedDevicesViewModel @Inject constructor(
    private val repository: OwnEncryptedDevicesProviding,
) : ViewModel() {

    private val _state = MutableStateFlow(EncryptedDevicesUiState(devices = repository.devices.value))
    val state: StateFlow<EncryptedDevicesUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { repository.devices.collect { list -> _state.update { it.copy(devices = list) } } }
        refresh()
    }

    fun refresh() {
        if (_state.value.isRefreshing) return
        _state.update { it.copy(isRefreshing = true) }
        viewModelScope.launch {
            val result = repository.refresh()
            _state.update {
                it.copy(
                    isRefreshing = false,
                    loadFailure = (result as? NetworkResult.Failure)?.error?.let(::failureOf),
                )
            }
        }
    }

    fun requestRetire(device: OwnEncryptedDevice) {
        if (!device.isRetirable) return
        _state.update { it.copy(pendingRetirement = device, retireFailure = null) }
    }

    fun cancelRetire() {
        _state.update { it.copy(pendingRetirement = null) }
    }

    fun dismissRetireFailure() {
        _state.update { it.copy(retireFailure = null) }
    }

    fun confirmRetire() {
        val device = _state.value.pendingRetirement ?: return
        if (device.deviceId in _state.value.retiringIds) return
        _state.update { it.copy(pendingRetirement = null, retiringIds = it.retiringIds + device.deviceId) }
        viewModelScope.launch {
            val result = repository.retire(device.deviceId)
            _state.update {
                it.copy(
                    retiringIds = it.retiringIds - device.deviceId,
                    retireFailure = (result as? NetworkResult.Failure)?.error?.let(::failureOf),
                )
            }
        }
    }

    private fun failureOf(error: ApiError): EncryptedDevicesFailure =
        if (error.code == OFFLINE_CODE) EncryptedDevicesFailure.OFFLINE else EncryptedDevicesFailure.UNAVAILABLE

    private companion object {
        const val OFFLINE_CODE = "NETWORK"
    }
}
