package me.meeshy.sdk.report

import me.meeshy.sdk.model.health.ConnectionDiagnosis
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.HealthApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le diagnostic de connexion : `GET /health/ready` distingue un serveur injoignable, dégradé ou
 * sain, sans jamais exposer de détail interne (la sonde n'en sert aucun, et rien n'est relayé).
 */
@Singleton
public class ConnectionDiagnosticRepository @Inject constructor(
    private val healthApi: HealthApi,
) {
    public suspend fun diagnose(): ConnectionDiagnosis = when (val result = apiCall { healthApi.ready() }) {
        is NetworkResult.Success -> ConnectionDiagnosis.resolve(result.data.status, httpStatus = 200, transportFailed = false)
        is NetworkResult.Failure -> ConnectionDiagnosis.resolve(
            status = null,
            httpStatus = result.error.httpStatus,
            transportFailed = result.error.code == "NETWORK",
        )
    }
}
