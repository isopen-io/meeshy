package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class UserApiRoutesTest {

    @Test
    fun `devices are listed and revoked by their row id`() = runTest {
        val list = RecordingHttp(
            responseBody = """{"success":true,"data":[{"id":"r1","type":"fcm","platform":"android","deviceName":"Pixel","isActive":true,"extra":1}]}""",
        )
        val devices = list.serve(UserApi::class.java).listDevices()
        assertThat(list.only.method).isEqualTo("GET")
        assertThat(list.only.path).isEqualTo("/api/v1/users/me/devices")
        assertThat(devices.data!!.single().deviceName).isEqualTo("Pixel")

        val revoke = RecordingHttp(responseBody = """{"success":true,"data":{"message":"ok"}}""")
        revoke.serve(UserApi::class.java).revokeDevice("r1")
        assertThat(revoke.only.method).isEqualTo("DELETE")
        assertThat(revoke.only.path).isEqualTo("/api/v1/users/me/devices/r1")
    }

    @Test
    fun `mentions of the user and of a message are readable`() = runTest {
        val mine = RecordingHttp(
            responseBody = """{"success":true,"data":[{"id":"m1","messageId":"x","message":{"id":"x","content":"hi @me","sender":null,"conversation":{"id":"c","title":"T","type":"group"}}}]}""",
        )
        val mentions = mine.serve(MentionsApi::class.java).mine(limit = 20)
        assertThat(mine.only.path).isEqualTo("/api/v1/mentions/me")
        assertThat(mine.only.queryParameter("limit")).isEqualTo("20")
        assertThat(mentions.data!!.single().message!!.conversation!!.title).isEqualTo("T")

        val forMessage = RecordingHttp(
            responseBody = """{"success":true,"data":[{"id":"u1","messageId":"x","mentionedUserId":"u1","mentionedUser":{"id":"u1","username":"alice"}}]}""",
        )
        val users = forMessage.serve(MentionsApi::class.java).forMessage("x")
        assertThat(forMessage.only.path).isEqualTo("/api/v1/mentions/messages/x")
        assertThat(users.data!!.single().mentionedUser!!.username).isEqualTo("alice")
    }

    @Test
    fun `mention suggestions are asked for a context and keep the server order`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":[{"id":"u1","username":"anna","displayName":null,"avatar":null,"badge":"friend","inConversation":false,"isFriend":true,"group":"known"},{"id":"u2","username":"zed","displayName":"Zed","avatar":"z.png","badge":"other","inConversation":true,"isFriend":false,"profileDecor":{"ring":"x"}}]}""",
        )
        val suggestions = http.serve(MentionsApi::class.java).suggestions(contextId = "p1", contextType = "post", query = "an")
        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/mentions/suggestions")
        assertThat(http.only.queryParameter("contextId")).isEqualTo("p1")
        assertThat(http.only.queryParameter("contextType")).isEqualTo("post")
        assertThat(http.only.queryParameter("query")).isEqualTo("an")
        assertThat(suggestions.data!!.map { it.id }).containsExactly("u1", "u2").inOrder()
        assertThat(suggestions.data!!.first().group).isEqualTo("known")
        assertThat(suggestions.data!!.last().group).isNull()
    }
}
