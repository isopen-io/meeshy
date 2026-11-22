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
import okio.Buffer
import org.junit.Test
import retrofit2.Retrofit

/**
 * Le lien d'entrée d'une communauté se met en pause (#19661) : `PUT /communities/:id/join-link`
 * avec `{ paused }`, et la passerelle sert `{ joinLinkPausedAt }` (instant ISO, ou nul quand le lien est
 * actif). La requête est capturée au dernier maillon et la réponse traverse le vrai `Json` de [MeeshyApi].
 */
class CommunityJoinLinkEndpointTest {

    private val baseUrl = "https://gate.staging.meeshy.me/api/v1/"
    private val communityId = "68b0000000000000000000c1"

    private class Capture {
        var request: Request? = null
        var body: String? = null
    }

    private fun apiServing(body: String, capture: Capture): CommunityApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                capture.request = chain.request()
                capture.body = chain.request().body?.let { sent -> Buffer().also { sent.writeTo(it) }.readUtf8() }
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(body.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build()
            .create(CommunityApi::class.java)
    }

    @Test
    fun `pausing the link is a PUT on the community join-link address with the paused flag`() = runTest {
        val capture = Capture()
        apiServing("""{"success":true,"data":{"joinLinkPausedAt":"2026-11-20T08:00:00.000Z"}}""", capture)
            .setJoinLinkState(communityId, CommunityJoinLinkStateRequest(paused = true))

        assertThat(capture.request!!.method).isEqualTo("PUT")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/communities/$communityId/join-link")
        assertThat(capture.body).isEqualTo("""{"paused":true}""")
    }

    @Test
    fun `a paused link decodes its instant`() = runTest {
        val response = apiServing("""{"success":true,"data":{"joinLinkPausedAt":"2026-11-20T08:00:00.000Z"}}""", Capture())
            .setJoinLinkState(communityId, CommunityJoinLinkStateRequest(paused = true))

        assertThat(response.data!!.joinLinkPausedAt).isEqualTo("2026-11-20T08:00:00.000Z")
    }

    @Test
    fun `a resumed link decodes a null instant`() = runTest {
        val response = apiServing("""{"success":true,"data":{"joinLinkPausedAt":null}}""", Capture())
            .setJoinLinkState(communityId, CommunityJoinLinkStateRequest(paused = false))

        assertThat(response.data!!.joinLinkPausedAt).isNull()
    }
}
