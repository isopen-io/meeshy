package me.meeshy.sdk.model.share

/**
 * **Quelle représentation d'un élément remis par une autre app la feuille de partage charge**
 * (#11134, #11430). Miroir de `ShareItemRepresentation` (extension iOS), les identifiants de type
 * UTI devenant des types MIME et deux marqueurs : [URL_TYPE] (un lien) et [FILE_URL_TYPE] (le
 * chemin `file://` d'un fichier).
 *
 * L'ordre : lien web > média (image, vidéo) > fichier (un document, ou l'URL d'un fichier qu'on
 * COPIE) > lien > texte > donnée nue. **Le média d'abord, son chemin jamais** : Google Photos
 * remet, à côté de la photo, une URL de fichier que rien ne doit prendre pour un lien. **Le lien
 * d'abord quand il est le sujet** : Chrome met dans le même partage le lien d'une page et sa
 * vignette ; c'est le lien qu'on partage.
 */
sealed interface ShareItemRepresentation {
    data class Media(val mimeType: String) : ShareItemRepresentation
    data class File(val mimeType: String) : ShareItemRepresentation

    /** Un simple chemin `file://` sans fichier remis : jamais une pièce. */
    data object FileUrl : ShareItemRepresentation
    data object Link : ShareItemRepresentation
    data object Text : ShareItemRepresentation
    data object Unsupported : ShareItemRepresentation

    /** Seuls un média et un fichier copiable deviennent une pièce jointe. */
    val isPiece: Boolean get() = this is Media || this is File

    companion object {
        const val URL_TYPE: String = "text/uri-list"
        const val FILE_URL_TYPE: String = "text/x-file-uri"

        private val abstractMedia = setOf("image/*", "video/*", "audio/*")

        fun isMedia(type: String): Boolean = type.startsWith("image/") || type.startsWith("video/")

        /**
         * @param types les types annoncés par l'élément, dans l'ordre de l'app source.
         * @param text le texte remis à côté, s'il y en a : un texte qui n'est qu'une URL web est un lien.
         */
        fun choose(types: List<String>, text: String? = null): ShareItemRepresentation {
            val normalized = types.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
            val hasFileUrl = FILE_URL_TYPE in normalized
            if (carriesWebLink(normalized, hasFileUrl) || (!hasFileUrl && isWebUrl(text))) return Link
            preferredMedia(normalized)?.let { return Media(it) }
            if (hasFileUrl) {
                return normalized.firstOrNull(::isDocument)?.let { File(it) } ?: FileUrl
            }
            if (URL_TYPE in normalized) return Link
            if (normalized.any { it.startsWith("text/") }) return if (isWebUrl(text)) Link else Text
            return normalized.firstOrNull { it != URL_TYPE }?.let { File(it) } ?: Unsupported
        }

        /** Un texte réduit à UNE URL http(s) est un lien, pas une phrase. */
        fun isWebUrl(text: String?): Boolean {
            val trimmed = text?.trim().orEmpty()
            if (trimmed.isEmpty() || trimmed.any { it.isWhitespace() }) return false
            val lower = trimmed.lowercase()
            val rest = when {
                lower.startsWith("https://") -> trimmed.substring(8)
                lower.startsWith("http://") -> trimmed.substring(7)
                else -> return false
            }
            return rest.isNotEmpty() && !rest.startsWith("/")
        }

        private fun carriesWebLink(types: List<String>, hasFileUrl: Boolean): Boolean =
            URL_TYPE in types && !hasFileUrl

        private fun preferredMedia(types: List<String>): String? {
            val media = types.filter(::isMedia)
            return media.firstOrNull { it !in abstractMedia && !it.endsWith("/*") } ?: media.firstOrNull()
        }

        private fun isDocument(type: String): Boolean =
            type != URL_TYPE && type != FILE_URL_TYPE && !isMedia(type) && !type.startsWith("text/")
    }
}
