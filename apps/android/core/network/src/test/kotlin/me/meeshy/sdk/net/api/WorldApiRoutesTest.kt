package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.world.LinkMembershipRequest
import org.junit.Test

class WorldApiRoutesTest {

    @Test
    fun `l'entree World Wide se lit par GET world`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"identifier":"world","title":"World Wide","shareLinkIdentifier":"mshy_w"}}""",
        )

        val response = http.serve(WorldApi::class.java).entry()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/world")
        assertThat(response.data!!.shareLinkIdentifier).isEqualTo("mshy_w")
    }

    @Test
    fun `l'invite entre par la porte canonique des liens avec son nom et sa langue`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"sessionToken":"tok","conversationId":"c1","participantId":"p1"}}""",
        )

        val response = http.serve(WorldApi::class.java).joinAsGuest("mshy_w", LinkMembershipRequest("Amina", "fr"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/links/mshy_w/members")
        assertThat(http.only.body).contains("\"nickname\":\"Amina\"")
        assertThat(http.only.body).contains("\"language\":\"fr\"")
        assertThat(response.data!!.conversationId).isEqualTo("c1")
    }
}
