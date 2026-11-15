package me.meeshy.sdk.model.net

import java.net.URI

/**
 * La politique d'une URL média avant toute requête (protection SSRF) — miroir de la
 * validation de `MeeshyConfig.resolveMediaURL` (iOS).
 *
 * https seulement, ou http sur un hôte de bouclage ; `file://` (média local optimiste) passe
 * sans contrôle d'hôte ; 10/8, 172.16/12, 192.168/16, 169.254/16 et 127/8 sont refusées sauf
 * en environnement local (passerelle de développement). Une URL refusée ne déclenche aucune
 * requête.
 */
public object MediaUrlPolicy {

    public fun isAllowed(url: String, localEnvironment: Boolean = false): Boolean {
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme == "file") return true
        val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return false
        val schemeOk = scheme == "https" || (scheme == "http" && isLoopbackHost(host))
        if (!schemeOk) return false
        return localEnvironment || !isPrivateAddress(host)
    }

    /** La base d'API pointe-t-elle une machine locale (émulateur, LAN) ? */
    public fun isLocalEnvironment(apiBaseUrl: String?): Boolean {
        val host = apiBaseUrl
            ?.let { runCatching { URI(it).host }.getOrNull() }
            ?.lowercase()
            ?: return false
        return isLoopbackHost(host) || isPrivateAddress(host)
    }

    private fun isLoopbackHost(host: String): Boolean =
        host == "localhost" || host == "::1" || host == "[::1]" || host == "127.0.0.1"

    private fun octets(host: String): List<Int>? {
        val parts = host.split('.').map { it.toIntOrNull() ?: return null }
        return parts.takeIf { it.size == 4 }
    }

    private fun isPrivateAddress(host: String): Boolean {
        val o = octets(host) ?: return false
        return o[0] == 10 ||
            (o[0] == 172 && o[1] in 16..31) ||
            (o[0] == 192 && o[1] == 168) ||
            (o[0] == 169 && o[1] == 254) ||
            o[0] == 127
    }
}
