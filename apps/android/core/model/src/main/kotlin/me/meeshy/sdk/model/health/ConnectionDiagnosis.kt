package me.meeshy.sdk.model.health

import kotlinx.serialization.Serializable

/** Charge de `GET /health/ready` : un verdict, rien d'autre (la passerelle n'expose aucun détail). */
@Serializable
data class ReadyProbe(val status: String? = null)

/** Ce que le diagnostic de connexion sait dire du serveur. */
enum class ConnectionDiagnosis { UNREACHABLE, DEGRADED, HEALTHY;

    companion object {
        const val READY: String = "ready"

        /**
         * - rien n'a répondu ([httpStatus] `null`, [transportFailed]) : serveur injoignable ;
         * - le serveur répond sans dire « ready » (503 `not-ready`, 5xx, charge illisible) : dégradé ;
         * - 2xx et `ready` : sain.
         */
        fun resolve(status: String?, httpStatus: Int?, transportFailed: Boolean): ConnectionDiagnosis = when {
            transportFailed && httpStatus == null -> UNREACHABLE
            httpStatus != null && httpStatus !in 200..299 -> DEGRADED
            status == READY -> HEALTHY
            else -> DEGRADED
        }
    }
}
