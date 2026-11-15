package me.meeshy.sdk.e2ee

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
import javax.inject.Inject
import javax.inject.Singleton

/** « Mes appareils chiffrés » (#13014) : la dernière liste servie, la relire, retirer un appareil. */
interface OwnEncryptedDevicesProviding {
    /** La dernière liste confirmée par la passerelle pour CE compte ; `null` tant qu'aucune ne l'a été. */
    val devices: StateFlow<List<OwnEncryptedDevice>?>

    suspend fun refresh(): NetworkResult<List<OwnEncryptedDevice>>

    /**
     * Retire [device] tel qu'il a été LU (place et génération). Refusé sans appel réseau s'il n'est
     * pas dans la liste de ce compte ; refusé par la passerelle si la place a changé d'occupant.
     * Réussit aussi quand la passerelle dit l'appareil déjà retiré : l'état voulu est atteint.
     */
    suspend fun retire(device: OwnEncryptedDevice): NetworkResult<Unit>
}

/**
 * La liste vit en mémoire pour l'ouvrir sans attente au second passage, et se vide à la
 * déconnexion ([PerAccountCache]) : un second compte ne voit jamais les appareils du premier, et
 * une lecture ou un retrait partis avant le vidage n'écrivent plus rien après lui (génération,
 * vérifiée et écrite sous le même verrou que le vidage).
 */
@Singleton
class OwnEncryptedDevicesRepository @Inject constructor(
    private val api: E2eeDeviceApi,
) : OwnEncryptedDevicesProviding, PerAccountCache {

    private val lock = Any()
    private val state = MutableStateFlow<List<OwnEncryptedDevice>?>(null)
    private var generation = 0L

    override val devices: StateFlow<List<OwnEncryptedDevice>?> = state.asStateFlow()

    override suspend fun refresh(): NetworkResult<List<OwnEncryptedDevice>> {
        val startedAt = currentGeneration()
        val result = when (val raw = apiCall { api.ownDevices() }) {
            is NetworkResult.Failure -> raw
            is NetworkResult.Success -> OwnEncryptedDevicesDecoder.decode(raw.data)
                ?.let { NetworkResult.Success(OwnEncryptedDevicesDecoder.ordered(it)) }
                ?: NetworkResult.Failure(MALFORMED)
        }
        if (result is NetworkResult.Success) writeIfSameAccount(startedAt) { result.data }
        return result
    }

    override suspend fun retire(device: OwnEncryptedDevice): NetworkResult<Unit> {
        val startedAt = currentGeneration()
        if (state.value?.any { it.deviceId == device.deviceId && it.registrationId == device.registrationId } != true) {
            return NetworkResult.Failure(UNKNOWN_DEVICE)
        }
        val result = when (val raw = apiCall { api.retireDevice(device.deviceId, device.registrationId) }) {
            is NetworkResult.Success -> if (confirmsRetirement(raw.data, device.deviceId)) RETIRED else NetworkResult.Failure(MALFORMED)
            is NetworkResult.Failure -> if (raw.error.isAlreadyRetired()) RETIRED else raw
        }
        when {
            result is NetworkResult.Success -> writeIfSameAccount(startedAt) { list -> list?.filterNot { it.deviceId == device.deviceId } }
            (result as NetworkResult.Failure).error.code == DEVICE_CHANGED -> refresh()
        }
        return result
    }

    override suspend fun clear() {
        synchronized(lock) {
            generation += 1
            state.value = null
        }
    }

    private fun currentGeneration(): Long = synchronized(lock) { generation }

    private fun writeIfSameAccount(startedAt: Long, next: (List<OwnEncryptedDevice>?) -> List<OwnEncryptedDevice>?) {
        synchronized(lock) {
            if (generation == startedAt) state.value = next(state.value)
        }
    }

    private fun confirmsRetirement(data: JsonObject, deviceId: Int): Boolean {
        val retired = (data["retired"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
        val served = (data["deviceId"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
        return retired == true && served == deviceId
    }

    private fun ApiError.isAlreadyRetired(): Boolean = httpStatus == NOT_FOUND && code == DEVICE_NOT_BOUND

    companion object {
        /** La place a changé d'occupant depuis la liste lue (passerelle, 409). */
        const val DEVICE_CHANGED: String = "E2EE_DEVICE_CHANGED"

        /** La session de l'appareil à retirer n'a pas pu être fermée : rien n'est retiré (passerelle, 503, #13013). */
        const val DEVICE_SESSION_NOT_CLOSED: String = "E2EE_DEVICE_SESSION_NOT_CLOSED"

        /** L'appareil n'est pas dans la liste de ce compte (liste vidée, ou jamais lue). */
        const val UNKNOWN_DEVICE_CODE: String = "E2EE_DEVICE_NOT_LISTED"

        private const val NOT_FOUND = 404
        private const val DEVICE_NOT_BOUND = "E2EE_DEVICE_NOT_BOUND"
        private val RETIRED: NetworkResult<Unit> = NetworkResult.Success(Unit)
        private val MALFORMED = ApiError(message = "Réponse de l'annuaire chiffré invalide", code = "MALFORMED_RESPONSE")
        private val UNKNOWN_DEVICE = ApiError(message = "Appareil absent de la liste de ce compte", code = UNKNOWN_DEVICE_CODE)
    }
}
