package me.meeshy.sdk.model.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [DataExportRequestBuilder] projects a scope [DataExportSelection] into the `GET /me/export`
 * query params. `profile` is always first and present; `messages`/`contacts` are appended only
 * when selected, in the gateway's `parseTypes` order; the format token is [ExportFormat.wireValue].
 */
class DataExportRequestBuilderTest {

    @Test
    fun `profile is always present even when nothing else is selected`() {
        val query = DataExportRequestBuilder.build(
            DataExportSelection(includeMessages = false, includeContacts = false),
        )

        assertThat(query.types).isEqualTo("profile")
    }

    @Test
    fun `messages is appended after profile when selected`() {
        val query = DataExportRequestBuilder.build(
            DataExportSelection(includeMessages = true, includeContacts = false),
        )

        assertThat(query.types).isEqualTo("profile,messages")
    }

    @Test
    fun `contacts is appended after profile when only contacts selected`() {
        val query = DataExportRequestBuilder.build(
            DataExportSelection(includeMessages = false, includeContacts = true),
        )

        assertThat(query.types).isEqualTo("profile,contacts")
    }

    @Test
    fun `all three sections keep the profile-messages-contacts order`() {
        val query = DataExportRequestBuilder.build(
            DataExportSelection(includeMessages = true, includeContacts = true),
        )

        assertThat(query.types).isEqualTo("profile,messages,contacts")
    }

    @Test
    fun `json format emits the json wire token`() {
        val query = DataExportRequestBuilder.build(DataExportSelection(format = ExportFormat.JSON))

        assertThat(query.format).isEqualTo("json")
    }

    @Test
    fun `csv format emits the csv wire token`() {
        val query = DataExportRequestBuilder.build(DataExportSelection(format = ExportFormat.CSV))

        assertThat(query.format).isEqualTo("csv")
    }

    @Test
    fun `every ExportFormat wire token matches its gateway enum value`() {
        assertThat(ExportFormat.JSON.wireValue).isEqualTo("json")
        assertThat(ExportFormat.CSV.wireValue).isEqualTo("csv")
        assertThat(ExportFormat.ordered).containsExactly(ExportFormat.JSON, ExportFormat.CSV).inOrder()
    }
}
