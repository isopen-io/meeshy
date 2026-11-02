package me.meeshy.sdk.net

import me.meeshy.sdk.model.auth.ServerEnvironment
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver

/** Centralised SDK configuration — base URLs and toggles. */
data class MeeshyConfig(
    val apiBaseUrl: String = DEFAULT_API_BASE_URL,
    val socketUrl: String = DEFAULT_SOCKET_URL,
    val enableLogging: Boolean = false,
) {
    companion object {
        const val DEFAULT_API_BASE_URL: String = "https://gate.meeshy.me/api/v1/"
        const val DEFAULT_SOCKET_URL: String = "https://gate.meeshy.me"

        /** Dérivé de [ServerEnvironment.STAGING] : un seul hôte pour API, socket, web et médias. */
        val STAGING: MeeshyConfig = MeeshyConfig(
            apiBaseUrl = ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.STAGING) + "/",
            socketUrl = ServerEnvironment.STAGING.origin,
        )
    }
}
