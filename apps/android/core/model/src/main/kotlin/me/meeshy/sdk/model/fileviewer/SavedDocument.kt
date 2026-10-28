package me.meeshy.sdk.model.fileviewer

import java.util.Locale

/**
 * Ce que « Télécharger le document » propose au sélecteur du système. Le nom et le type viennent de l'EXPÉDITEUR :
 * aucun segment de chemin, aucun caractère de contrôle ou de direction, aucun caractère réservé, une longueur bornée
 * qui garde l'extension, et un type MIME qui ne peut pas faire échouer l'ouverture du sélecteur.
 */
object SavedDocument {

    const val MAX_NAME_CHARS: Int = 120
    private const val OCTET_STREAM = "application/octet-stream"
    private const val RESERVED = "<>:\"|?*"
    private val mimeToken = Regex("^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$")

    fun fileName(raw: String, fallback: String): String {
        val base = raw.substringAfterLast('/').substringAfterLast('\\')
        val cleaned = base.filterNot { it.isISOControl() || it in RESERVED || Character.getType(it) == Character.FORMAT.toInt() }
            .trim().trim('.').trim()
        if (cleaned.isEmpty()) return fallback
        if (cleaned.length <= MAX_NAME_CHARS) return cleaned
        val extension = cleaned.substringAfterLast('.', "").takeIf { it.isNotEmpty() && it.length <= 10 }
        val suffix = extension?.let { ".$it" }.orEmpty()
        return cleaned.take(MAX_NAME_CHARS - suffix.length).trimEnd() + suffix
    }

    fun mimeType(raw: String): String {
        val bare = raw.substringBefore(';').trim().lowercase(Locale.ROOT)
        return if (mimeToken.matches(bare)) bare else OCTET_STREAM
    }
}
