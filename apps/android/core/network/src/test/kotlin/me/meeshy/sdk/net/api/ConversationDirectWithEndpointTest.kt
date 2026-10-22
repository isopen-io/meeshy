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

/**
 * #11615 — « la dernière conversation directe avec cette personne » parle à UNE adresse :
 * `GET /conversations?type=direct&withUserId=…&limit=1` (gateway `core-list.ts`, miroir de
 * `ConversationService.findDirectWith` iOS).
 *
 * Comme [PublicProfileEndpointTest], la requête est CAPTURÉE au dernier maillon avant le réseau :
 * lire l'annotation prouve ce qui est écrit, pas ce qui part — la concaténation du chemin et
 * l'encodage des paramètres vivent dans Retrofit, le décodage dans le `Json` de [MeeshyApi].
 */
class ConversationDirectWithEndpointTest {

    private class Capture {
        var request: Request? = null
    }

    private fun apiServing(body: String, capture: Capture): ConversationApi {
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
            .create(ConversationApi::class.java)
    }

    @Test
    fun `la requete part sur la liste des conversations filtree sur les directs avec la personne`() = runTest {
        val capture = Capture()

        apiServing("""{"success":true,"data":[]}""", capture)
            .directWith(type = "direct", withUserId = "6ad65e870d750c3615db0597", limit = 1)

        val url = checkNotNull(capture.request).url
        assertThat(capture.request?.method).isEqualTo("GET")
        assertThat(url.encodedPath).isEqualTo("/api/v1/conversations")
        assertThat(url.queryParameter("type")).isEqualTo("direct")
        assertThat(url.queryParameter("withUserId")).isEqualTo("6ad65e870d750c3615db0597")
        assertThat(url.queryParameter("limit")).isEqualTo("1")
    }

    @Test
    fun `la reponse decode la conversation directe servie avec ses participants`() = runTest {
        val body = """
            {"success":true,"data":[{
              "id":"6ad677020d750c3615db2234","type":"direct",
              "participants":[
                {"id":"p-reader","userId":"u-reader","displayName":"Moi"},
                {"id":"p-peer","userId":"u-peer","displayName":"Mc","avatar":"/mc.webp"}
              ]
            }]}
        """.trimIndent()

        val response = apiServing(body, Capture()).directWith("direct", "u-peer", 1)

        val conversation = response.data.orEmpty().single()
        assertThat(conversation.id).isEqualTo("6ad677020d750c3615db2234")
        assertThat(conversation.participants.map { it.userId }).containsExactly("u-reader", "u-peer").inOrder()
    }

    @Test
    fun `une liste vide veut dire aucun direct, pas une erreur`() = runTest {
        val response = apiServing("""{"success":true,"data":[]}""", Capture()).directWith("direct", "u-peer", 1)

        assertThat(response.success).isTrue()
        assertThat(response.data).isEmpty()
    }
}
