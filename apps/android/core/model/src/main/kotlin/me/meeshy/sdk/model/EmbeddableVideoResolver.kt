package me.meeshy.sdk.model

/**
 * Résout une adresse de vidéo YouTube en identifiant + départ — miroir d'`EmbeddableVideoResolver`
 * iOS. Hôtes acceptés : `youtu.be`, `youtube.com` et `youtube-nocookie.com` (et leurs sous-domaines),
 * jamais par sous-chaîne. Formes : `/watch?v=`, `/shorts|embed|v|live/<id>`. L'identifiant compte
 * 6 à 20 caractères `[A-Za-z0-9_-]`. Le départ vient de `t` / `start` (requête) ou de `#t=` ;
 * `90`, `90s` et `1h2m3s` sont lus.
 */
object EmbeddableVideoResolver {

    private val urlRegex = Regex("""https?://[^\s<>"')\]]+""", RegexOption.IGNORE_CASE)
    private val idRegex = Regex("""^[A-Za-z0-9_-]{6,20}$""")
    private val pathPrefixes = setOf("shorts", "embed", "v", "live")

    /** La première vidéo d'un texte, ou `null`. */
    fun resolveIn(text: String): YouTubeLink? {
        if (!text.contains("youtu", ignoreCase = true)) return null
        return urlRegex.findAll(text).firstNotNullOfOrNull { resolve(it.value.trimEnd('.', ',', ';', ':', '!', '?')) }
    }

    fun resolve(url: String): YouTubeLink? {
        val schemeEnd = url.indexOf("://")
        if (schemeEnd < 0) return null
        val scheme = url.substring(0, schemeEnd).lowercase()
        if (scheme != "http" && scheme != "https") return null
        val afterScheme = url.substring(schemeEnd + 3)
        val authority = afterScheme.substringBefore('/').substringBefore('?').substringBefore('#')
        val host = authority.substringAfterLast('@').substringBefore(':').lowercase()
        val rest = afterScheme.removePrefix(authority)
        val fragment = rest.substringAfter('#', "")
        val beforeFragment = rest.substringBefore('#')
        val path = beforeFragment.substringBefore('?')
        val params = beforeFragment.substringAfter('?', "").split('&')
            .filter { '=' in it }
            .associate { it.substringBefore('=') to it.substringAfter('=') }
        val start = parseStart(params["t"] ?: params["start"] ?: fragmentValue(fragment, "t"))
        val id = when {
            host == "youtu.be" -> path.removePrefix("/")
            isYouTubeHost(host) -> idFromYouTubePath(path, params)
            else -> null
        } ?: return null
        return if (idRegex.matches(id)) YouTubeLink(id, start) else null
    }

    private fun isYouTubeHost(host: String): Boolean =
        host == "youtube.com" || host.endsWith(".youtube.com") ||
            host == "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")

    private fun idFromYouTubePath(path: String, params: Map<String, String>): String? {
        if (path == "/watch") return params["v"]
        val parts = path.split('/').filter { it.isNotEmpty() }
        return if (parts.size >= 2 && parts[0] in pathPrefixes) parts[1] else null
    }

    private fun fragmentValue(fragment: String, key: String): String? =
        fragment.split('&').firstNotNullOfOrNull { pair ->
            pair.takeIf { it.substringBefore('=') == key && '=' in it }?.substringAfter('=')
        }

    private fun parseStart(raw: String?): Int? {
        if (raw == null) return null
        raw.toIntOrNull()?.let { return it }
        var total = 0
        var number = ""
        var matched = false
        for (ch in raw) {
            if (ch.isDigit()) {
                number += ch
                continue
            }
            val n = number.toIntOrNull() ?: return if (matched) total else null
            val unit = when (ch.lowercaseChar()) {
                'h' -> 3600
                'm' -> 60
                's' -> 1
                else -> return if (matched) total else null
            }
            total += n * unit
            matched = true
            number = ""
        }
        number.toIntOrNull()?.let { total += it; matched = true }
        return if (matched) total else null
    }
}
