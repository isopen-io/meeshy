package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test
import retrofit2.http.GET

/**
 * Le renouvellement présente ce que la passerelle exige (`refreshTokenRequestSchema` :
 * `token` obligatoire) : le JWT présenté ET le jeton de session, comme iOS
 * (`AuthService.refreshToken(token, sessionToken:)`). Sans `token`, la passerelle répond 400,
 * le renouvellement échoue et la session est vidée — l'utilisateur retombe sur la connexion.
 */
class MeeshyApiRefreshBodyTest {

    interface Probe {
        @GET("probe")
        suspend fun probe(): okhttp3.ResponseBody
    }

    private val expiredJwt = "h." + java.util.Base64.getUrlEncoder().withoutPadding()
        .encodeToString("""{"exp":1}""".toByteArray()) + ".s"

    @Test
    fun `le renouvellement envoie le jwt presente et le jeton de session`() {
        val server = MockWebServer().apply {
            enqueue(MockResponse().setBody("""{"success":false}"""))
            enqueue(MockResponse().setBody("ok"))
            start()
        }
        try {
            val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString(), socketUrl = "x")
            val store = InMemoryTokenStore(jwt = expiredJwt, sessionToken = "session-1")
            val api = MeeshyApi.create(config, store) {}

            runCatching { kotlinx.coroutines.runBlocking { api.service(Probe::class.java).probe() } }

            val refresh = server.takeRequest()
            assertThat(refresh.path).isEqualTo("/api/v1/auth/refresh")
            val body = Json.parseToJsonElement(refresh.body.readUtf8()).jsonObject
            assertThat(body["token"]?.jsonPrimitive?.content).isEqualTo(expiredJwt)
            assertThat(body["sessionToken"]?.jsonPrimitive?.content).isEqualTo("session-1")
        } finally {
            server.shutdown()
        }
    }
}
