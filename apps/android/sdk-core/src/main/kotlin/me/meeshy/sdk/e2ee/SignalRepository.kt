package me.meeshy.sdk.e2ee

import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.model.signal.EstablishSessionResult
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.model.signal.SignalPreKeyUploadResult
import me.meeshy.sdk.model.signal.SignalWireDecoder
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SignalApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Ce dont la publication a besoin de la passerelle — une couture pour tester sans réseau. */
interface SignalBundleGateway {
    suspend fun uploadBundle(bundle: SignalPreKeyBundle): NetworkResult<SignalPreKeyUploadResult>

    suspend fun fetchBundle(userId: String): NetworkResult<SignalPreKeyBundle>
}

/**
 * Les routes les routes Signal. La `data` est lue comme OBJET puis décodée STRICTEMENT
 * ([SignalWireDecoder]) : jamais de coercition d'un champ de sécurité (rétrogradation, ARCHITECTURE 8.6).
 * Une réponse malformée est un échec `MALFORMED_RESPONSE`, jamais un succès partiel. Aucun bundle, clé
 * ni signature n'est journalisé ici.
 */
@Singleton
class SignalRepository @Inject constructor(private val api: SignalApi) : SignalBundleGateway {

    override suspend fun uploadBundle(bundle: SignalPreKeyBundle): NetworkResult<SignalPreKeyUploadResult> =
        strict(apiCall { api.uploadKeysObject(bundle) }, SignalWireDecoder::uploadResult)

    override suspend fun fetchBundle(userId: String): NetworkResult<SignalPreKeyBundle> =
        strict(apiCall { api.keysForObject(userId) }) { data -> SignalWireDecoder.bundle(data)?.takeIf(::hasWellFormedKeys) }

    suspend fun establishSession(request: EstablishSessionRequest): NetworkResult<EstablishSessionResult> =
        strict(apiCall { api.establishSessionObject(request) }, SignalWireDecoder::establishResult)

    private fun <T> strict(
        raw: NetworkResult<kotlinx.serialization.json.JsonObject>,
        decode: (kotlinx.serialization.json.JsonObject) -> T?,
    ): NetworkResult<T> = when (raw) {
        is NetworkResult.Failure -> raw
        is NetworkResult.Success -> decode(raw.data)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(MALFORMED)
    }

    private fun hasWellFormedKeys(bundle: SignalPreKeyBundle): Boolean =
        decodedSize(bundle.identityKey) == KEY_BYTES &&
            decodedSize(bundle.signedPreKeyPublic) == KEY_BYTES &&
            decodedSize(bundle.signedPreKeySignature) == SIGNATURE_BYTES

    private fun decodedSize(text: String): Int? = CanonicalBase64.decode(text)?.size

    private companion object {
        const val KEY_BYTES = 32
        const val SIGNATURE_BYTES = 64
        val MALFORMED = ApiError(message = "Réponse Signal invalide", code = "MALFORMED_RESPONSE")
    }
}
