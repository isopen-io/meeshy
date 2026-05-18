package me.meeshy.sdk.net

/** Centralised SDK configuration — base URLs and toggles. */
data class MeeshyConfig(
    val apiBaseUrl: String = DEFAULT_API_BASE_URL,
    val socketUrl: String = DEFAULT_SOCKET_URL,
    val enableLogging: Boolean = false,
) {
    companion object {
        const val DEFAULT_API_BASE_URL: String = "https://gate.meeshy.me/api/v1/"
        const val DEFAULT_SOCKET_URL: String = "https://gate.meeshy.me"

        val STAGING: MeeshyConfig = MeeshyConfig(
            apiBaseUrl = "https://staging.meeshy.me/api/v1/",
            socketUrl = "https://staging.meeshy.me",
        )
    }
}
