package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.contacts.ContactMatchEntry
import me.meeshy.sdk.model.contacts.ContactMatchRequest
import org.junit.Test

class ContactMatchEndpointTest {

    private val answer = """{"success":true,"data":{"matches":[{"user":{"id":"u1","username":"alice","isOnline":true,"unknownField":1},"matchedBy":"email","contactDisplayName":"Alice"}],"totalContacts":3,"matchedCount":1}}"""

    @Test
    fun `match is a POST with the entries and the country`() = runTest {
        val http = RecordingHttp(responseBody = answer)
        val response = http.serve(ContactMatchApi::class.java).match(
            ContactMatchRequest(listOf(ContactMatchEntry(displayName = "Alice", emails = listOf("a@b.c"))), "FR"),
        )

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/users/me/contacts/match")
        assertThat(http.only.body).contains("\"emails\":[\"a@b.c\"]")
        assertThat(http.only.body).contains("\"phoneNumbers\":[]")
        assertThat(http.only.body).contains("\"defaultCountry\":\"FR\"")
        assertThat(response.data!!.matches.single().user.username).isEqualTo("alice")
        assertThat(response.data!!.matchedCount).isEqualTo(1)
    }

    @Test
    fun `resolve is a POST on contacts resolve and returns only accounts`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"accounts":[{"userId":"u1","displayName":"Alice","username":"alice","relation":"friend"}]}}""",
        )
        val response = http.serve(ContactsApi::class.java).resolve(
            ContactResolveRequest.bounded(listOf(" +33612 ", "+33612"), listOf("A@B.C"), "FR"),
        )

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/contacts/resolve")
        assertThat(http.only.body).contains("\"phones\":[\"+33612\"]")
        assertThat(http.only.body).contains("\"emails\":[\"a@b.c\"]")
        assertThat(response.data!!.accounts.single().relationState.wire).isEqualTo("friend")
    }

    @Test
    fun `a resolve request is bounded to ten identifiers per list`() {
        val request = ContactResolveRequest.bounded(List(25) { "+3361$it" }, emptyList())
        assertThat(request.phones).hasSize(10)
        assertThat(ContactResolveRequest.bounded(emptyList(), emptyList()).isEmpty).isTrue()
    }
}
