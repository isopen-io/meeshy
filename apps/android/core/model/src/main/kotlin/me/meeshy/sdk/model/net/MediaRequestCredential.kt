package me.meeshy.sdk.model.net

import java.net.URI

/**
 * Les en-têtes d'identité d'une requête MÉDIA, et l'adresse jouable d'un son de la bibliothèque.
 *
 * Une seule route média est protégée : `GET <api>/static/:filename`, l'audio de la bibliothèque de sons (JWT exigé,
 * fichier servi tel quel, sans redirection). Le jeton ne part QUE vers elle : même origine que l'API (schéma, hôte,
 * port) ET chemin exactement `<chemin de l'API>static/<nom de fichier>` — un seul segment, sans `..`, sans séquence
 * encodée, sans requête ni fragment. Toute autre adresse, y compris sur l'origine de l'API, reçoit une requête NUE :
 * une `mediaURL` écrite par l'auteur d'une story ne peut donc pas faire partir l'identité du lecteur vers une route de
 * son choix. `Authorization: Bearer` prime ; à défaut, `X-Session-Token`.
 */
public object MediaRequestCredential {

    public fun headers(url: String, apiBaseUrl: String?, jwt: String?, sessionToken: String?): Map<String, String> {
        if (apiBaseUrl == null || !isLibraryAudio(url, apiBaseUrl)) return emptyMap()
        return when {
            !jwt.isNullOrEmpty() -> mapOf(AUTHORIZATION to "Bearer $jwt")
            !sessionToken.isNullOrEmpty() -> mapOf(SESSION_TOKEN to sessionToken)
            else -> emptyMap()
        }
    }

    /**
     * L'adresse absolue d'un son de la bibliothèque — la passerelle sert `/api/v1/static/<fichier>`, relatif à son
     * origine. `null` pour toute autre forme : une piste qui prétend être un son emprunté sans en avoir l'adresse
     * canonique ne se joue pas.
     */
    public fun libraryAudioUrl(mediaUrl: String?, apiBaseUrl: String?): String? {
        val raw = mediaUrl?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val base = apiBaseUrl ?: return null
        val origin = parse(base) ?: return null
        val absolute = if (raw.startsWith("/") && !raw.startsWith("//")) origin.render() + raw else raw
        return absolute.takeIf { isLibraryAudio(it, base) }
    }

    private fun isLibraryAudio(url: String, apiBaseUrl: String): Boolean {
        val target = parse(url) ?: return false
        val api = parse(apiBaseUrl) ?: return false
        if (target.scheme != api.scheme || target.host != api.host || target.port != api.port) return false
        if (target.rawQuery != null || target.rawFragment != null) return false
        val prefix = api.rawPath.trimEnd('/') + "/" + STATIC_SEGMENT + "/"
        val path = target.rawPath
        if (!path.startsWith(prefix)) return false
        return FILE_NAME.matches(path.removePrefix(prefix))
    }

    private data class Parsed(
        val scheme: String,
        val host: String,
        val port: Int,
        val rawPath: String,
        val rawQuery: String?,
        val rawFragment: String?,
    ) {
        fun render(): String {
            val implicit = (scheme == "https" && port == 443) || (scheme == "http" && port == 80)
            return if (implicit) "$scheme://$host" else "$scheme://$host:$port"
        }
    }

    private fun parse(url: String): Parsed? {
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        val port = uri.port.takeIf { it != -1 } ?: when (scheme) {
            "https" -> 443
            "http" -> 80
            else -> return null
        }
        return Parsed(scheme, host, port, uri.rawPath.orEmpty(), uri.rawQuery, uri.rawFragment)
    }

    private const val STATIC_SEGMENT = "static"
    private val FILE_NAME = Regex("^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$")
    private const val AUTHORIZATION = "Authorization"
    private const val SESSION_TOKEN = "X-Session-Token"
}
