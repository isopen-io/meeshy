package me.meeshy.sdk.model.net

import java.net.URI

/**
 * Les en-têtes d'identité d'une requête MÉDIA — miroir de `DiskCacheStore.networkRequest` (iOS).
 *
 * Certaines routes média sont protégées (`/api/v1/static/:filename`, l'audio de la bibliothèque de sons) : sans jeton,
 * la passerelle répond 401 et l'aperçu, le fond du composeur et la lecture d'un son emprunté restent muets. Seule
 * l'ORIGINE de l'API (même schéma, hôte et port) reçoit le jeton — un CDN ou un hôte tiers reçoit une requête NUE.
 * `Authorization: Bearer` prime ; à défaut, `X-Session-Token` (session anonyme), même convention que l'API.
 */
public object MediaRequestCredential {

    public fun headers(url: String, apiBaseUrl: String?, jwt: String?, sessionToken: String?): Map<String, String> {
        val target = parse(url) ?: return emptyMap()
        val origin = apiBaseUrl?.let(::parse) ?: return emptyMap()
        if (target != origin) return emptyMap()
        return when {
            !jwt.isNullOrEmpty() -> mapOf(AUTHORIZATION to "Bearer $jwt")
            !sessionToken.isNullOrEmpty() -> mapOf(SESSION_TOKEN to sessionToken)
            else -> emptyMap()
        }
    }

    private data class Origin(val scheme: String, val host: String, val port: Int)

    private fun parse(url: String): Origin? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        val port = uri.port.takeIf { it != -1 } ?: when (scheme) {
            "https" -> 443
            "http" -> 80
            else -> return null
        }
        return Origin(scheme, host, port)
    }

    private const val AUTHORIZATION = "Authorization"
    private const val SESSION_TOKEN = "X-Session-Token"
}
