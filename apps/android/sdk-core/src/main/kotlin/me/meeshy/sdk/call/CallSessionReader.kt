package me.meeshy.sdk.call

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import javax.inject.Singleton
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.net.api.CallApi

/**
 * Relit une session d'appel par son identifiant (`GET /calls/:id`, iOS `CallsEndpoint.byCallId`) : la lecture qui
 * sert un membre de la conversation comme un invité qui ne l'est pas encore (#19650), là où
 * `GET /conversations/:id/active-call` répond 404 à qui n'est pas membre. Toute panne rend `null`.
 */
@Singleton
class CallSessionReader @Inject constructor(
    private val callApi: CallApi,
) {
    suspend fun session(callId: String): ActiveCallSession? {
        if (callId.isBlank()) return null
        val response = try {
            callApi.details(callId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            return null
        }
        return response.takeIf { it.success }?.data
    }
}
