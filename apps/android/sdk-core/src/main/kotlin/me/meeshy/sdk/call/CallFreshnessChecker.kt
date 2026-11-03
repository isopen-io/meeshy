package me.meeshy.sdk.call

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.call.CallFreshness
import me.meeshy.sdk.net.api.CallApi

/**
 * Relit `GET /calls/:id` à la réception d'une push d'appel. Toute panne (réseau, 4xx, `success=false`)
 * retombe sur [CallFreshness.Live] : mieux vaut sonner pour un appel fini que manquer un appel vivant.
 */
@Singleton
class CallFreshnessChecker @Inject constructor(
    private val callApi: CallApi,
) {
    suspend fun check(callId: String): CallFreshness {
        val status = runCatching { callApi.details(callId) }
            .getOrNull()
            ?.takeIf { it.success }
            ?.data
            ?.status
        return CallFreshness.of(status)
    }
}
