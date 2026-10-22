package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.appearance.AppearancePackDomain
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
 * Les packs installés parlent à UNE adresse par domaine — `GET /packs/<domaine>/installed`. La
 * requête est CAPTURÉE au dernier maillon avant le réseau (modèle de `PublicProfileEndpointTest`),
 * et la réponse remonte toute la chaîne de conversion réelle : l'annotation lue ne prouve pas ce
 * qui PART, ni que la liste tolérante est bien celle que Retrofit instancie.
 */
class PackApiTest {

    private val baseUrl = "https://gate.staging.meeshy.me/api/v1/"

    private class Capture {
        var request: Request? = null
    }

    private fun apiServing(body: String, capture: Capture): PackApi {
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
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build()
            .create(PackApi::class.java)
    }

    private val servedList = """
        {"success":true,"data":[
          {"slug":"essentiels","name":"Essentiels","installed":true,"owned":true,"removable":false,"coverUrl":"/api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp"},
          {"slug":"heritages","name":"Héritages","installed":true,"price":120,"owned":true}
        ]}
    """.trimIndent()

    @Test
    fun `the installed packs of a domain are read from its own address`() = runTest {
        val capture = Capture()

        apiServing(servedList, capture).installed("wallpaper")

        assertThat(capture.request!!.method).isEqualTo("GET")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/packs/wallpaper/installed")
    }

    @Test
    fun `each appearance domain has its own installed address`() = runTest {
        val paths = AppearancePackDomain.entries.map { domain ->
            val capture = Capture()
            apiServing(servedList, capture).installed(domain)
            capture.request!!.url.encodedPath
        }

        assertThat(paths).containsExactly(
            "/api/v1/packs/wallpaper/installed",
            "/api/v1/packs/banner/installed",
            "/api/v1/packs/avatar-ring/installed",
            "/api/v1/packs/banner-frame/installed",
        ).inOrder()
    }

    @Test
    fun `the served list decodes with the ownership rule of an old or a new server`() = runTest {
        val packs = apiServing(servedList, Capture()).installed("wallpaper").data!!.packs

        assertThat(packs.map { it.slug }).containsExactly("essentiels", "heritages").inOrder()
        assertThat(packs.map { it.installed }).containsExactly(true, true)
        assertThat(packs.map { it.removable }).containsExactly(false, true).inOrder()
        assertThat(packs.map { it.isOwned }).containsExactly(true, true)
    }

    @Test
    fun `a pack the client cannot read falls alone through the whole conversion chain`() = runTest {
        val body = """{"success":true,"data":[{"slug":"essentiels","installed":true},{"slug":null},"x",{"slug":"animes","installed":true}]}"""

        val packs = apiServing(body, Capture()).installed("wallpaper").data!!.packs

        assertThat(packs.map { it.slug }).containsExactly("essentiels", "animes").inOrder()
    }

    @Test
    fun `an empty installed list is an empty list, not an error`() = runTest {
        val response = apiServing("""{"success":true,"data":[]}""", Capture()).installed("banner")

        assertThat(response.success).isTrue()
        assertThat(response.data!!.packs).isEmpty()
    }
}
