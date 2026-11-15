package me.meeshy.sdk.model

/** Une version antérieure d'un message modifié : `content` est la valeur AVANT la modification datée `editedAtMillis`. */
data class EditRevision(val revision: Int, val content: String, val editedAtMillis: Long)

/** Une ligne de la fiche « Historique » : la version courante ou la n-ième version antérieure. */
sealed interface EditHistoryRow {
    val content: String
    val timestampMillis: Long?

    data class Current(override val content: String, override val timestampMillis: Long?) : EditHistoryRow
    data class Version(val number: Int, override val content: String, override val timestampMillis: Long) : EditHistoryRow
}

/** Ce que la fiche affiche : vide, ou la version courante suivie des versions antérieures, la plus récente d'abord. */
data class EditHistory(val rows: List<EditHistoryRow>, val previousCount: Int) {
    val isEmpty: Boolean get() = previousCount == 0
}

/** Miroir de `MessageEditsDetailView` : « Actuel » d'abord, puis « Version N » décroissant. */
object EditHistoryProjection {
    fun project(currentContent: String, currentTimestampMillis: Long?, revisions: List<EditRevision>): EditHistory {
        if (revisions.isEmpty()) return EditHistory(rows = emptyList(), previousCount = 0)
        val newestFirst = revisions.sortedByDescending { it.editedAtMillis }
        val versions = newestFirst.mapIndexed { index, revision ->
            EditHistoryRow.Version(number = newestFirst.size - index, content = revision.content, timestampMillis = revision.editedAtMillis)
        }
        return EditHistory(
            rows = listOf<EditHistoryRow>(EditHistoryRow.Current(currentContent, currentTimestampMillis)) + versions,
            previousCount = versions.size,
        )
    }

    /** Une révision n'est gardée que si elle apporte une valeur distincte de la nouvelle. */
    fun shouldRecord(previousContent: String?, newContent: String): Boolean =
        !previousContent.isNullOrBlank() && previousContent != newContent
}
