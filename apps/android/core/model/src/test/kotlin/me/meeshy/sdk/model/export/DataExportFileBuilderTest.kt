package me.meeshy.sdk.model.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [DataExportFileBuilder] turns a parsed [DataExportData] into a shareable [ExportArtifact].
 * Format resolution keys on what the server returned (`format` + a non-empty `csv` map), the file
 * name derives a filesystem-safe stamp from the ISO export date, and the JSON artifact re-serialises
 * the whole payload (surpassing iOS, which shared only the summary counts).
 */
class DataExportFileBuilderTest {

    @Test
    fun `json export produces a json artifact re-serialising the full payload`() {
        val data = DataExportData(
            exportDate = "2026-07-11T12:34:56.789Z",
            format = "json",
            requestedTypes = listOf("profile", "messages"),
            profile = ExportedProfile(id = "u1", username = "alice", email = "a@b.co"),
            messages = listOf(ExportedMessage(id = "m1", content = "hi")),
            messagesCount = 1,
        )

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.mimeType).isEqualTo("application/json")
        assertThat(artifact.fileName).isEqualTo("meeshy-data-export-2026-07-11.json")
        // Full payload is present, not just the summary counts.
        assertThat(artifact.content).contains("\"username\": \"alice\"")
        assertThat(artifact.content).contains("\"content\": \"hi\"")
    }

    @Test
    fun `json artifact omits null fields`() {
        val data = DataExportData(
            exportDate = "2026-01-02T00:00:00.000Z",
            format = "json",
            profile = ExportedProfile(id = "u1", username = "bob"),
        )

        val artifact = DataExportFileBuilder.build(data)

        // explicitNulls = false → absent optional fields don't appear.
        assertThat(artifact.content).doesNotContain("\"bio\"")
    }

    @Test
    fun `csv export with sections produces a csv artifact joining the sections`() {
        val data = DataExportData(
            exportDate = "2026-07-11T09:00:00.000Z",
            format = "csv",
            csv = mapOf(
                "profile" to "id,username\nu1,alice",
                "contacts" to "conversationId\nc1",
            ),
        )

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.mimeType).isEqualTo("text/csv")
        assertThat(artifact.fileName).isEqualTo("meeshy-data-export-2026-07-11.csv")
        // Deterministic, sorted-by-section-name, each section headed by its name.
        assertThat(artifact.content).isEqualTo(
            "# contacts\nconversationId\nc1\n\n# profile\nid,username\nu1,alice",
        )
    }

    @Test
    fun `csv format with an empty csv map falls back to a json artifact`() {
        val data = DataExportData(
            exportDate = "2026-07-11T09:00:00.000Z",
            format = "csv",
            csv = emptyMap(),
        )

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.mimeType).isEqualTo("application/json")
        assertThat(artifact.fileName).endsWith(".json")
    }

    @Test
    fun `csv format with a null csv map falls back to a json artifact`() {
        val data = DataExportData(exportDate = "2026-07-11T09:00:00.000Z", format = "csv", csv = null)

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.mimeType).isEqualTo("application/json")
    }

    @Test
    fun `blank export date yields the plain base file name`() {
        val data = DataExportData(exportDate = "", format = "json")

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.fileName).isEqualTo("meeshy-data-export.json")
    }

    @Test
    fun `an all-illegal-character export date degrades to the plain base name`() {
        val data = DataExportData(exportDate = "  //:  ", format = "json")

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.fileName).isEqualTo("meeshy-data-export.json")
    }

    @Test
    fun `an export date with no T separator uses the whole sanitised value`() {
        val data = DataExportData(exportDate = "2026-07-11", format = "json")

        val artifact = DataExportFileBuilder.build(data)

        assertThat(artifact.fileName).isEqualTo("meeshy-data-export-2026-07-11.json")
    }
}
