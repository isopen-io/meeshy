package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Retrofit

/** Contrat de `GET /messages/{id}/read-status`, capturé au dernier maillon avant le réseau. */
class MessageReadStatusEndpointTest {

    private var captured: Request? = null

    private fun api(body: String): MessageApi {
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            captured = chain.request()
            Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(body.toResponseBody("application/json".toMediaType())).build()
        }.build()
        return Retrofit.Builder().baseUrl("https://gate.staging.meeshy.me/api/v1/").client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build().create(MessageApi::class.java)
    }

    @Test
    fun `read-status goes to the message address and decodes the three lists`() = runTest {
        val sut = api(
            """{"success":true,"data":{"messageId":"m1","totalMembers":3,"receivedCount":2,"readCount":1,
            "notSeenCount":1,"futureField":1,
            "receivedBy":[{"participantId":"p1","displayName":"Ana","avatarURL":null,"receivedAt":"2026-01-01T00:00:00.000Z"}],
            "readBy":[{"participantId":"p2","displayName":"Bo","avatarURL":"https://a/b.jpg","readAt":"2026-01-01T00:01:00.000Z"}],
            "notSeenBy":[{"participantId":"p3","displayName":"Cy"}]}}""",
        )

        val data = sut.readStatus("m1").data!!

        assertThat(captured!!.method).isEqualTo("GET")
        assertThat(captured!!.url.encodedPath).isEqualTo("/api/v1/messages/m1/read-status")
        assertThat(data.readBy.single().avatarURL).isEqualTo("https://a/b.jpg")
        assertThat(data.receivedBy.single().participantId).isEqualTo("p1")
        assertThat(data.notSeenBy!!.single().displayName).isEqualTo("Cy")
        assertThat(data.notSeenCount).isEqualTo(1)
    }

    @Test
    fun `an old gateway without notSeenBy still decodes`() = runTest {
        val data = api("""{"success":true,"data":{"messageId":"m1","totalMembers":2,"receivedCount":0,"readCount":0}}""")
            .readStatus("m1").data!!
        assertThat(data.notSeenBy).isNull()
        assertThat(data.readBy).isEmpty()
    }
}
