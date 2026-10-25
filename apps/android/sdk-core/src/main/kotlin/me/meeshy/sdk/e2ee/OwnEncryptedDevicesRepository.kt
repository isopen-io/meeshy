package me.meeshy.sdk.e2ee

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.e2ee.OwnEncryptedDevice
import me.meeshy.sdk.model.e2ee.OwnEncryptedDevicesDecoder
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.E2eeDeviceApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/** « Mes appareils chiffrés » (#13014) : la dernière liste servie, la relire, retirer un appareil. */
interface OwnEncryptedDevicesProviding {
    /** La dernière liste confirmée par la passerelle pour CE compte ; `null` tant qu'aucune ne l'a été. */
    val devices: StateFlow<List<OwnEncryptedDevice>?>

    suspend fun refresh(): NetworkResult<List<OwnEncryptedDevice>>

    /** Réussit aussi quand la passerelle dit l'appareil déjà retiré : l'état voulu est atteint. */
    suspend fun retire(deviceId: Int): NetworkResult<Unit>
}

/**
 * La liste vit en mémoire pour l'ouvrir sans attente au second passage, et se vide à la
 * déconnexion ([PerAccountCache]) : un second compte ne voit jamais les appareils du premier. Une
 * lecture partie avant le vidage n'écrit plus rien après lui (génération).
 */
@Singleton
class OwnEncryptedDevicesRepository @Inject constructor(
    private val api: E2eeDeviceApi,
) : OwnEncryptedDevicesProviding, PerAccountCache {

    private val state = MutableStateFlow<List<OwnEncryptedDevice>?>(null)
    private val generation = AtomicLong(0)

    override val devices: StateFlow<List<OwnEncryptedDevice>?> = state.asStateFlow()

    override suspend fun refresh(): NetworkResult<List<OwnEncryptedDevice>> {
        val startedAt = generation.get()
        val result = when (val raw = apiCall { api.ownDevices() }) {
            is NetworkResult.Failure -> raw
            is NetworkResult.Success -> OwnEncryptedDevicesDecoder.decode(raw.data)
                ?.let { NetworkResult.Success(OwnEncryptedDevicesDecoder.ordered(it)) }
                ?: NetworkResult.Failure(MALFORMED)
        }
        if (result is NetworkResult.Success && generation.get() == startedAt) state.value = result.data
        return result
    }

    override suspend fun retire(deviceId: Int): NetworkResult<Unit> {
        val startedAt = generation.get()
        val result = when (val raw = apiCall { api.retireDevice(deviceId) }) {
            is NetworkResult.Success -> if (confirmsRetirement(raw.data, deviceId)) RETIRED else NetworkResult.Failure(MALFORMED)
            is NetworkResult.Failure -> if (raw.error.isAlreadyRetired()) RETIRED else raw
        }
        if (result is NetworkResult.Success && generation.get() == startedAt) {
            state.update { list -> list?.filterNot { it.deviceId == deviceId } }
        }
        return result
    }

    override suspend fun clear() {
        generation.incrementAndGet()
        state.value = null
    }

    private fun confirmsRetirement(data: JsonObject, deviceId: Int): Boolean {
        val retired = (data["retired"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
        val served = (data["deviceId"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
        return retired == true && served == deviceId
    }

    private fun ApiError.isAlreadyRetired(): Boolean = httpStatus == NOT_FOUND && code == DEVICE_NOT_BOUND

    private companion object {
        const val NOT_FOUND = 404
        const val DEVICE_NOT_BOUND = "E2EE_DEVICE_NOT_BOUND"
        val RETIRED: NetworkResult<Unit> = NetworkResult.Success(Unit)
        val MALFORMED = ApiError(message = "Réponse de l'annuaire chiffré invalide", code = "MALFORMED_RESPONSE")
    }
}
