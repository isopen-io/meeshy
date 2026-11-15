package me.meeshy.sdk.model.share

/**
 * **Le nom d'origine d'un fichier reçu, assaini** (#11531) — miroir de
 * `ShareMediaStaging.sanitizedOriginalName`. Il voyage en MÉTADONNÉE jusqu'au `filename` de l'envoi,
 * **jamais dans un chemin** (#11134) : la copie s'appelle `<index>.<ext>`.
 */
object ShareFileName {
    /** Plafond d'un nom d'origine, en octets UTF-8. */
    const val MAX_ORIGINAL_NAME_BYTES: Int = 120

    private val mimeExtensions = mapOf(
        "image/jpeg" to "jpg", "image/png" to "png", "image/gif" to "gif", "image/webp" to "webp",
        "image/heic" to "heic", "image/heif" to "heif", "image/tiff" to "tiff",
        "video/mp4" to "mp4", "video/quicktime" to "mov", "video/webm" to "webm", "video/3gpp" to "3gp",
        "audio/mpeg" to "mp3", "audio/mp4" to "m4a", "audio/ogg" to "ogg", "audio/wav" to "wav",
        "application/pdf" to "pdf", "text/plain" to "txt",
    )

    /** Le premier candidat utilisable, réduit à un nom sûr ; rien d'utilisable : `null` (l'envoi garde `<index>.<ext>`). */
    fun sanitizedOriginalName(candidates: List<String?>, fallbackExt: String): String? =
        candidates.asSequence().filterNotNull().mapNotNull { sanitizedName(it, fallbackExt) }.firstOrNull()

    /** Seule une extension courte, minuscule et alphanumérique entre dans un chemin. */
    fun isSafeExtension(ext: String): Boolean =
        ext.length in 1..10 && ext.all { it in 'a'..'z' || it in '0'..'9' }

    /** L'extension de la copie : celle de la source, celle du MIME sinon, `bin` en dernier. */
    fun fileExtension(sourceExtension: String, mime: String): String =
        listOf(sourceExtension.lowercase(), mimeExtensions[mime.lowercase()].orEmpty()).firstOrNull(::isSafeExtension) ?: "bin"

    private fun sanitizedName(raw: String, fallbackExt: String): String? {
        val last = raw.split('/', '\\').lastOrNull { it.isNotEmpty() } ?: return null
        val cleaned = buildString { last.forEach { c -> if (!isInvisibleOrControl(c)) append(if (c == ':') '_' else c) } }
            .trim().dropWhile { it == '.' || it == ' ' }.trim()
        if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") return null
        val dot = cleaned.lastIndexOf('.')
        val nameExt = if (dot > 0) cleaned.substring(dot + 1) else ""
        val hasSafeExt = isSafeExtension(nameExt.lowercase()) && dot > 0
        val stem = if (hasSafeExt) cleaned.substring(0, dot) else cleaned
        val ext = if (hasSafeExt) nameExt else fallbackExt
        val suffix = if (ext.isEmpty()) "" else ".$ext"
        val cappedStem = truncated(stem, MAX_ORIGINAL_NAME_BYTES - suffix.toByteArray().size)
            .trim { it.isWhitespace() || it == '.' }
        return if (cappedStem.isEmpty()) null else cappedStem + suffix
    }

    private fun isInvisibleOrControl(c: Char): Boolean = when (c.code) {
        in 0x00..0x1F, in 0x7F..0x9F, in 0x200B..0x200F, in 0x202A..0x202E, in 0x2060..0x2069, 0xFEFF -> true
        else -> false
    }

    private fun truncated(text: String, limit: Int): String {
        if (limit <= 0) return ""
        var bytes = 0
        val out = StringBuilder()
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val size = String(Character.toChars(cp)).toByteArray().size
            if (bytes + size > limit) break
            bytes += size
            out.appendCodePoint(cp)
            i += Character.charCount(cp)
        }
        return out.toString()
    }
}
