package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
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
 * L'édition d'un lien parle à UNE adresse, `PATCH /links/:linkId`, et un champ vidé y part en
 * `null` EXPLICITE : la passerelle teste `!== undefined`, donc omettre `maxUses` pour dire
 * « illimité » laisserait l'ancienne limite en place. Requête CAPTURÉE au dernier maillon
 * (modèle `PublicProfileEndpointTest`), car `MeeshyApi.json` a `explicitNulls = false`.
 */
class LinkApiEditEndpointTest {

    private class Capture {
        var request: Request? = null
        var body: String? = null
    }

    private fun api(capture: Capture): LinkApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                capture.request = chain.request()
                capture.body = chain.request().body?.let { Buffer().also(it::writeTo).readUtf8() }
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body("""{"success":true,"data":[]}""".toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()
        return Retrofit.Builder()
            .baseUrl("https://gate.staging.meeshy.me/api/v1/")
            .client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build()
            .create(LinkApi::class.java)
    }

    @Test
    fun `an edit is a PATCH on the link and a cleared limit travels as an explicit null`() = runTest {
        val capture = Capture()
        api(capture).update(
            "mshy_1",
            buildJsonObject {
                put("name", JsonPrimitive("Launch"))
                put("maxUses", JsonNull)
            },
        )

        assertThat(capture.request!!.method).isEqualTo("PATCH")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/links/mshy_1")
        assertThat(capture.body).isEqualTo("""{"name":"Launch","maxUses":null}""")
    }

    @Test
    fun `the owner list asks for the conversation and the policy`() = runTest {
        val capture = Capture()
        api(capture).listMyLinks(offset = 0, limit = 50, expand = "conversation,policy")

        assertThat(capture.request!!.url.queryParameter("expand")).isEqualTo("conversation,policy")
        assertThat(capture.request!!.url.queryParameter("limit")).isEqualTo("50")
    }
}
