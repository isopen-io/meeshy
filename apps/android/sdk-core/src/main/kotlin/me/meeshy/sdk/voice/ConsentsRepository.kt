package me.meeshy.sdk.voice

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.model.voice.ConsentUpdateRequest
import me.meeshy.sdk.model.voice.grantedPurposes
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConsentsApi
import me.meeshy.sdk.net.apiCall

/**
 * `GET`/`PUT /me/consents` : la passerelle fait foi. Un octroi refusé n'écrit rien ; une relecture en panne ne touche à rien ;
 * une relecture réussie REMPLACE l'ensemble (un retrait fait ailleurs retire l'octroi local).
 */
@Singleton
class ConsentsRepository @Inject constructor(
    private val api: ConsentsApi,
    private val store: GrantedConsentsStore,
) {
    suspend fun refresh(): NetworkResult<Set<ConsentPurpose>> =
        when (val result = apiCall { api.consents() }) {
            is NetworkResult.Success -> {
                val granted = result.data.consents.grantedPurposes()
                store.replace(granted)
                NetworkResult.Success(granted)
            }
            is NetworkResult.Failure -> result
        }

    /** Octroie [purpose] ; la passerelle pose aussi chaque ancêtre manquant, que le magasin enregistre à son tour. */
    suspend fun grant(purpose: ConsentPurpose): NetworkResult<Unit> =
        when (val result = apiCall { api.setConsent(purpose.wire, ConsentUpdateRequest(granted = true)) }) {
            is NetworkResult.Success ->
                if (result.data.granted) {
                    store.replace(store.granted.value + purpose.lineage)
                    NetworkResult.Success(Unit)
                } else {
                    NetworkResult.Failure(ApiError(message = "Consent not granted", code = NOT_GRANTED))
                }
            is NetworkResult.Failure -> result
        }

    /** Retire [purpose] et ses descendants du magasin local après un retrait confirmé par le serveur. */
    suspend fun forgetLocally(purpose: ConsentPurpose) {
        store.replace(store.granted.value.filterNot { purpose in it.lineage }.toSet())
    }

    companion object {
        const val NOT_GRANTED: String = "CONSENT_NOT_GRANTED"
    }
}
