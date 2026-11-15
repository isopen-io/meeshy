package me.meeshy.sdk.model.push

import java.net.URI

/**
 * L'origine de confiance du service de notification — miroir de `NSETrustedOrigin`
 * (iOS). Une URL venue de la charge push n'est jamais crue : l'origine API se résout
 * dans une petite allowlist (production, staging, localhost), et un média ne se
 * télécharge que depuis l'hôte meeshy.me ou l'un de ses sous-domaines, en https.
 */
object PushTrustedOrigin {

    const val DEFAULT_API_BASE_URL: String = "https://gate.meeshy.me"

    private val allowedApiBaseUrls: Set<String> = setOf(
        DEFAULT_API_BASE_URL,
        "https://gate.staging.meeshy.me",
        "http://localhost:3000",
    )

    private const val ROOT_HOST = "meeshy.me"
    private const val LOCAL_HOST = "localhost"
    private const val LOCAL_PORT = 3000

    fun apiBaseUrl(stored: String?): String =
        stored?.takeIf { it in allowedApiBaseUrls } ?: DEFAULT_API_BASE_URL

    fun isTrustedMediaUrl(url: String): Boolean {
        val uri = runCatching { URI(url.trim()) }.getOrNull() ?: return false
        val host = uri.host?.lowercase() ?: return false
        if (uri.rawUserInfo != null) return false
        return when (uri.scheme?.lowercase()) {
            "https" -> uri.port == -1 && (host == ROOT_HOST || host.endsWith(".$ROOT_HOST"))
            "http" -> host == LOCAL_HOST && uri.port == LOCAL_PORT
            else -> false
        }
    }
}
