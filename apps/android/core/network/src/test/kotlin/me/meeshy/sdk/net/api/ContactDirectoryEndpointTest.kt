package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.contacts.ContactMatchEntry
import me.meeshy.sdk.model.contacts.DirectorySyncMode
import me.meeshy.sdk.model.contacts.DirectorySyncRequest
import org.junit.Test

/** Le repertoire parle `PUT` / `PATCH` / `GET directory/contacts` : le MODE est le verbe, jamais le corps. */
class ContactDirectoryEndpointTest {

    private val result = """{"success":true,"data":{"totalContacts":1,"processedContacts":1,"syncedCount":1,"matchedCount":0,"removedCount":0,"syncStartedAt":"2026-10-23T10:00:00.000Z","appliedAt":"2026-10-23T10:00:01.000Z"}}"""
    private val page = """{"success":true,"data":[{"id":"d1","contactKey":"k","displayName":"Maman","phoneNumbers":["+33612"],"isOnMeeshy":false}],"pagination":{"hasMore":true,"nextCursor":"d1","limit":100}}"""

    private fun request(mode: DirectorySyncMode) = DirectorySyncRequest(
        contacts = listOf(ContactMatchEntry(displayName = "Maman", phoneNumbers = listOf("+33612"))),
        defaultCountry = "FR",
        mode = mode,
        syncStartedAt = "T0",
        isFinalBatch = true,
    )

    @Test
    fun `replace is a PUT and the body carries no mode`() = runTest {
        val http = RecordingHttp(responseBody = result)
        val response = http.serve(ContactDirectoryApi::class.java).replace(request(DirectorySyncMode.Replace))

        assertThat(http.only.method).isEqualTo("PUT")
        assertThat(http.only.path).isEqualTo("/api/v1/directory/contacts")
        assertThat(http.only.body).doesNotContain("mode")
        assertThat(http.only.body).contains("\"syncStartedAt\":\"T0\"")
        assertThat(http.only.body).contains("\"isFinalBatch\":true")
        assertThat(http.only.body).contains("\"defaultCountry\":\"FR\"")
        assertThat(http.only.body).contains("\"emails\":[]")
        assertThat(response.data!!.syncStartedAt).isEqualTo("2026-10-23T10:00:00.000Z")
        assertThat(response.data!!.appliedAt).isNotNull()
    }

    @Test
    fun `merge is a PATCH on the same address`() = runTest {
        val http = RecordingHttp(responseBody = result)
        http.serve(ContactDirectoryApi::class.java).merge(request(DirectorySyncMode.Merge))

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/directory/contacts")
        assertThat(http.only.body).doesNotContain("mode")
    }

    @Test
    fun `a page forwards limit, filter, cursor, q and updatedSince`() = runTest {
        val http = RecordingHttp(responseBody = page)
        val response = http.serve(ContactDirectoryApi::class.java).page(
            limit = 100, filter = "meeshy", cursor = "c1", query = "mam", updatedSince = "2026-10-23T10:00:01.000Z",
        )

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/directory/contacts")
        assertThat(http.only.queryParameter("limit")).isEqualTo("100")
        assertThat(http.only.queryParameter("filter")).isEqualTo("meeshy")
        assertThat(http.only.queryParameter("cursor")).isEqualTo("c1")
        assertThat(http.only.queryParameter("q")).isEqualTo("mam")
        assertThat(http.only.queryParameter("updatedSince")).isEqualTo("2026-10-23T10:00:01.000Z")
        assertThat(response.data!!.single().resolvedName).isEqualTo("Maman")
        assertThat(response.pagination!!.nextCursor).isEqualTo("d1")
    }

    @Test
    fun `a first page sends neither cursor, q nor updatedSince`() = runTest {
        val http = RecordingHttp(responseBody = page)
        http.serve(ContactDirectoryApi::class.java).page(limit = 100)

        assertThat(http.only.hasQueryParameter("cursor")).isFalse()
        assertThat(http.only.hasQueryParameter("q")).isFalse()
        assertThat(http.only.hasQueryParameter("updatedSince")).isFalse()
        assertThat(http.only.queryParameter("filter")).isEqualTo("all")
    }
}
