package me.meeshy.sdk.model

/** Une vidéo YouTube trouvée dans un texte : de quoi peindre une façade et l'ouvrir dehors. */
data class YouTubeLink(val videoId: String, val startSeconds: Int? = null) {
    val thumbnailUrl: String get() = "https://img.youtube.com/vi/$videoId/hqdefault.jpg"
    val watchUrl: String
        get() = "https://www.youtube.com/watch?v=$videoId" + (startSeconds?.let { "&t=${it}s" } ?: "")
}

/**
 * Détecte la première URL YouTube d'un texte (miroir d'`EmbeddableVideoResolver` iOS) :
 * `youtu.be/<id>`, `youtube.com/watch?v=<id>`, `/shorts/<id>`, `/embed/<id>`, `m.`/`www.`.
 * L'hôte est comparé en entier (jamais en sous-chaîne) et l'identifiant doit avoir 11
 * caractères `[A-Za-z0-9_-]`. Pur : la mémoïsation par texte est l'affaire de l'appelant
 * (`remember(text)`), qui ne détecte donc qu'une fois par contenu.
 */
object YouTubeLinkDetector {
    private val urlRegex = Regex("""https?://[^\s<>"')\]]+""", RegexOption.IGNORE_CASE)
    private val idRegex = Regex("""^[A-Za-z0-9_-]{11}$""")
    private val hosts = setOf("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com")

    fun detect(text: String): YouTubeLink? {
        if (!text.contains("youtu", ignoreCase = true)) return null
        return urlRegex.findAll(text).firstNotNullOfOrNull { parse(it.value.trimEnd('.', ',', ';', ':', '!', '?')) }
    }

    private fun parse(url: String): YouTubeLink? {
        val afterScheme = url.substringAfter("://")
        val host = afterScheme.substringBefore('/').substringBefore('?').substringBefore('#').lowercase()
        val rest = afterScheme.removePrefix(afterScheme.substringBefore('/')).removePrefix("/")
        val path = rest.substringBefore('?').substringBefore('#')
        val query = rest.substringAfter('?', "").substringBefore('#')
        val params = query.split('&').filter { '=' in it }.associate { it.substringBefore('=') to it.substringAfter('=') }
        val id = when {
            host == "youtu.be" -> path.substringBefore('/')
            host in hosts -> when {
                path == "watch" -> params["v"].orEmpty()
                path.startsWith("shorts/") -> path.removePrefix("shorts/").substringBefore('/')
                path.startsWith("embed/") -> path.removePrefix("embed/").substringBefore('/')
                path.startsWith("live/") -> path.removePrefix("live/").substringBefore('/')
                else -> ""
            }
            else -> ""
        }
        if (!idRegex.matches(id)) return null
        val start = (params["t"] ?: params["start"])?.removeSuffix("s")?.toIntOrNull()
        return YouTubeLink(id, start)
    }
}
