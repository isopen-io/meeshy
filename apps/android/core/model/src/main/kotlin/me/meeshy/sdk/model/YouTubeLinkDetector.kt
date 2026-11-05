package me.meeshy.sdk.model

/** Une vidéo YouTube trouvée dans un texte : de quoi peindre une façade et l'ouvrir dehors. */
data class YouTubeLink(val videoId: String, val startSeconds: Int? = null) {
    val thumbnailUrl: String get() = "https://img.youtube.com/vi/$videoId/hqdefault.jpg"
    val watchUrl: String
        get() = "https://www.youtube.com/watch?v=$videoId" + (startSeconds?.let { "&t=${it}s" } ?: "")
}

/**
 * Détecte la première URL YouTube d'un texte : délègue à [EmbeddableVideoResolver] (miroir
 * d'`EmbeddableVideoResolver` iOS). Pur : la mémoïsation par texte est l'affaire de l'appelant.
 */
object YouTubeLinkDetector {
    fun detect(text: String): YouTubeLink? = EmbeddableVideoResolver.resolveIn(text)
}
