package me.meeshy.sdk.model.export

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * A ready-to-share export file: a filesystem-safe [fileName], the MIME [mimeType] to hand the
 * Android share sheet, and the file [content] as text. Pure value — the screen writes it to a
 * cache file and launches the share intent (that I/O is coverage-exempt glue).
 */
public data class ExportArtifact(
    val fileName: String,
    val mimeType: String,
    val content: String,
)

/**
 * Pure builder turning a parsed [DataExportData] into a shareable [ExportArtifact] — the single
 * source of truth for the export file's name, MIME type and body.
 *
 * Surpasses the iOS `DataExportView`, whose share wrapper dropped the actual profile/messages/
 * contacts payload and shared only the summary counts: here the JSON artifact re-serialises the
 * **whole** payload so the user gets their real data.
 *
 * Format resolution keys on what the server actually returned ([DataExportData.format] +
 * presence of a non-empty [DataExportData.csv] map), never on the request:
 * - `format == "csv"` **and** a non-empty `csv` map → a `text/csv` file joining the sections.
 * - otherwise → an `application/json` file re-encoding the full payload (this also covers a
 *   `csv` request that came back with no CSV sections, so the share is never an empty file).
 */
public object DataExportFileBuilder {
    private const val BASE_NAME: String = "meeshy-data-export"

    private val exportJson = Json {
        prettyPrint = true
        explicitNulls = false
        encodeDefaults = true
    }

    public fun build(data: DataExportData): ExportArtifact {
        val stamp = safeStamp(data.exportDate)
        val csv = data.csv
        val isCsv = data.format == ExportFormat.CSV.wireValue && !csv.isNullOrEmpty()
        return if (isCsv) {
            ExportArtifact(
                fileName = fileName(stamp, "csv"),
                mimeType = "text/csv",
                content = renderCsv(csv),
            )
        } else {
            ExportArtifact(
                fileName = fileName(stamp, "json"),
                mimeType = "application/json",
                content = exportJson.encodeToString(data),
            )
        }
    }

    private fun fileName(stamp: String, extension: String): String =
        if (stamp.isEmpty()) "$BASE_NAME.$extension" else "$BASE_NAME-$stamp.$extension"

    /**
     * Reduces an ISO-8601 export date to a filesystem-safe token: the calendar-date part before
     * the `T`, keeping only `[0-9A-Za-z-]`. A blank/absent or all-illegal date yields `""` (the
     * file then falls back to the plain base name).
     */
    private fun safeStamp(exportDate: String): String {
        val datePart = exportDate.trim().substringBefore('T')
        return datePart.filter { it.isDigit() || it in 'A'..'Z' || it in 'a'..'z' || it == '-' }
    }

    /** Joins the per-section CSV strings the gateway returned into one deterministic document. */
    private fun renderCsv(sections: Map<String, String>): String =
        sections.entries
            .sortedBy { it.key }
            .joinToString(separator = "\n\n") { (name, body) -> "# $name\n$body" }
}
