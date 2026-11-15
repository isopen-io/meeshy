package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
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

/**
 * La sonde d'une session d'invité part en `PATCH /guest-sessions/me`, comme iOS (`GuestSessionsEndpoint.me`) et le web :
 * la passerelle ne sert sur cette adresse que PATCH et DELETE, un GET n'y rencontre aucune route.
 */
class GuestSessionEndpointTest {

    private class Capture {
        var request: Request? = null
    }

    private fun apiServing(body: String, capture: Capture): GuestSessionApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                capture.request = chain.request()
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
            .baseUrl("https://gate.staging.meeshy.me/api/v1/")
            .client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build()
            .create(GuestSessionApi::class.java)
    }

    @Test
    fun `la sonde de session part en PATCH sur guest-sessions me et lit la session servie`() = runTest {
        val capture = Capture()
        val api = apiServing("""{"success":true,"data":{"participant":{"id":"p1"}}}""", capture)

        val response = api.me()

        val request = checkNotNull(capture.request)
        assertThat(request.method).isEqualTo("PATCH")
        assertThat(request.url.encodedPath).isEqualTo("/api/v1/guest-sessions/me")
        assertThat(response.success).isTrue()
        assertThat(response.data?.jsonObject?.keys).containsExactly("participant")
    }
}
