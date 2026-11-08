package me.meeshy.sdk.model.paste

import java.net.URLDecoder

/** Le résultat de [FileUrlPasteDetector.detect] : le texte débarrassé des `file://` et les chemins décodés. */
public data class FileUrlPasteResult(val cleaned: String, val paths: List<String>)

/**
 * Détection pure des URL `file://` dans un texte collé (miroir de `FileURLPasteDetector`, iOS). Un `file://` sans chemin
 * exploitable (phrase tapée, racine seule) est un faux positif : le texte reste intact.
 */
public object FileUrlPasteDetector {
    private val pattern = Regex("file://\\S+")
    private val spaces = Regex("[ \\t]{2,}")

    public fun detect(text: String): FileUrlPasteResult {
        if (!text.contains("file://")) return FileUrlPasteResult(text, emptyList())
        val found = pattern.findAll(text).mapNotNull { match ->
            decodedPath(match.value)?.let { match to it }
        }.toList()
        if (found.isEmpty()) return FileUrlPasteResult(text, emptyList())
        val stripped = found.foldRight(text) { (match, _), acc -> acc.removeRange(match.range) }
        val cleaned = stripped.replace(spaces, " ").trim()
        return FileUrlPasteResult(cleaned, found.map { it.second })
    }

    private fun decodedPath(raw: String): String? {
        val path = raw.removePrefix("file://").substringBefore('?').substringBefore('#')
        val withoutHost = if (path.startsWith("/")) path else "/" + path.substringAfter('/', "")
        val decoded = runCatching { URLDecoder.decode(withoutHost.replace("+", "%2B"), "UTF-8") }.getOrNull() ?: return null
        return decoded.takeIf { it.isNotEmpty() && it != "/" }
    }
}
