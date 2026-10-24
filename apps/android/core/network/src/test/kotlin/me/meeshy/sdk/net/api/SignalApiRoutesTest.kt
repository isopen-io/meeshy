package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import org.junit.Test

/** Les trois routes Signal, telles qu'elles partent. */
class SignalApiRoutesTest {

    private val bundle = SignalPreKeyBundle(
        identityKey = "ik",
        registrationId = 1234,
        deviceId = 1,
        signedPreKeyId = 7,
        signedPreKeyPublic = "spk",
        signedPreKeySignature = "sig",
    )

    private fun signal(http: RecordingHttp) = http.serve(SignalApi::class.java)

    @Test
    fun `publishing keys posts the bundle to the keys route`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"registrationId":1234,"deviceId":1,"signedPreKeyId":7,"message":"ok"}}""",
        )

        val response = signal(http).uploadKeys(bundle)

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/signal/keys")
        assertThat(http.only.body).contains("\"identityKey\":\"ik\"")
        assertThat(http.only.body).contains("\"signedPreKeyId\":7")
        assertThat(response.data?.registrationId).isEqualTo(1234)
    }

    @Test
    fun `reading someone's keys gets their bundle by user id`() = runTest {
        val http = RecordingHttp(
            responseBody = """
                {"success":true,"data":{"identityKey":"ik","registrationId":1,"deviceId":1,"preKeyId":null,
                 "signedPreKeyId":2,"signedPreKeyPublic":"spk","signedPreKeySignature":"sig"}}
            """.trimIndent(),
        )

        val response = signal(http).keysFor("68b0000000000000000000bb")

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/signal/keys/68b0000000000000000000bb")
        assertThat(response.data?.signedPreKeyId).isEqualTo(2)
        assertThat(response.data?.preKeyId).isNull()
    }

    @Test
    fun `establishing a session posts the recipient and the conversation`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"message":"E2EE session established successfully"}}""",
        )

        val response = signal(http).establishSession(EstablishSessionRequest("u2", "c1"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/signal/session/establish")
        assertThat(http.only.body).isEqualTo("""{"recipientUserId":"u2","conversationId":"c1"}""")
        assertThat(response.data?.message).isEqualTo("E2EE session established successfully")
    }
}

/** Les variantes à `data` brute partent sur les mêmes routes et ne coercent rien. */
class SignalApiObjectRoutesTest {
    private val bundle = SignalPreKeyBundle(
        identityKey = "ik", registrationId = 1, deviceId = 1, signedPreKeyId = 7,
        signedPreKeyPublic = "spk", signedPreKeySignature = "sig",
    )

    @Test
    fun `les trois variantes objet utilisent les memes verbes et chemins`() = kotlinx.coroutines.test.runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"registrationId":"1","message":"ok"}}""")
        val api = http.serve(SignalApi::class.java)

        val upload = api.uploadKeysObject(bundle)
        api.keysForObject("u9")
        api.establishSessionObject(EstablishSessionRequest("u2", "c1"))

        assertThat(http.requests.map { it.method to it.path }).containsExactly(
            "POST" to "/api/v1/signal/keys",
            "GET" to "/api/v1/signal/keys/u9",
            "POST" to "/api/v1/signal/session/establish",
        ).inOrder()
        assertThat(upload.data?.get("registrationId").toString()).isEqualTo("\"1\"")
    }
}
