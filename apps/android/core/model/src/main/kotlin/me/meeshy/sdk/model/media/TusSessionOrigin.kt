package me.meeshy.sdk.model.media

import java.net.URI

/**
 * Whether a tus session address may receive the account's credential (#13429, after #13431): the
 * `HEAD` / `PATCH` calls go through the authenticated client, which attaches the bearer to ANY host,
 * so a session address is only ever used when it resolves to the API's own origin (scheme, host,
 * port). A relative address resolves against the API and is always ours. An address from another
 * host — a hostile or misconfigured `Location`, or a checkpoint written under another server
 * environment — is never contacted with the token. Pure.
 */
public object TusSessionOrigin {

    public fun isSameOrigin(location: String, apiBaseUrl: String): Boolean {
        if (location.isBlank()) return false
        val base = parse(apiBaseUrl) ?: return false
        val target = parse(location)?.let { base.resolve(it) } ?: return false
        val scheme = target.scheme?.lowercase() ?: return false
        return scheme == base.scheme?.lowercase() &&
            target.host?.lowercase() == base.host?.lowercase() &&
            target.host != null &&
            portOf(target) == portOf(base)
    }

    private fun parse(value: String): URI? = runCatching { URI(value.trim()) }.getOrNull()

    private fun portOf(uri: URI): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme.equals("https", ignoreCase = true) -> HTTPS_PORT
        uri.scheme.equals("http", ignoreCase = true) -> HTTP_PORT
        else -> -1
    }

    private const val HTTPS_PORT = 443
    private const val HTTP_PORT = 80
}
