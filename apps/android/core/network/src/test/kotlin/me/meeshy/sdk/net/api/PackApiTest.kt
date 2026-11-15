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

    private val servedShop = """{"success":true,"data":{"balance":340,"domains":[{"domain":"wallpaper","packs":[{"slug":"animes","price":90,"owned":false}]}]}}"""

    @Test
    fun `the shop is read from one address filtered by the asked domains`() = runTest {
        val capture = Capture()

        val shop = apiServing(servedShop, capture).shop(listOf(AppearancePackDomain.WALLPAPER, AppearancePackDomain.AVATAR_RING)).data!!

        assertThat(capture.request!!.method).isEqualTo("GET")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/packs/shop")
        assertThat(capture.request!!.url.queryParameter("domains")).isEqualTo("wallpaper,avatar-ring")
        assertThat(shop.balance).isEqualTo(340)
        assertThat(shop.packs(AppearancePackDomain.WALLPAPER).single().canBuy).isTrue()
    }

    @Test
    fun `a purchase posts only its intention id to the pack address and reads the served pack and balance`() = runTest {
        val capture = Capture()
        val body = """{"success":true,"data":{"pack":{"slug":"animes","price":90,"owned":true,"installed":true},"balance":250}}"""

        val bought = apiServing(body, capture).purchase(AppearancePackDomain.BANNER_FRAME, "animes", "req-1").data!!

        assertThat(capture.request!!.method).isEqualTo("POST")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/packs/banner-frame/animes/purchase")
        val sent = okio.Buffer().also { capture.request!!.body!!.writeTo(it) }.readUtf8()
        assertThat(sent).isEqualTo("""{"requestId":"req-1"}""")
        assertThat(bought.pack.isOwned).isTrue()
        assertThat(bought.balance).isEqualTo(250)
    }

    private val servedPack = """{"success":true,"data":{"slug":"animes","price":90,"owned":true,"installed":true,"installCount":5}}"""

    @Test
    fun `installing a pack puts to its install address and reads the served summary`() = runTest {
        val capture = Capture()

        val pack = apiServing(servedPack, capture).setInstalled(AppearancePackDomain.BANNER_FRAME, "animes", installed = true).data!!

        assertThat(capture.request!!.method).isEqualTo("PUT")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/packs/banner-frame/animes/install")
        assertThat(pack.installed).isTrue()
        assertThat(pack.installCount).isEqualTo(5)
    }

    @Test
    fun `removing a pack deletes its install address`() = runTest {
        val capture = Capture()

        apiServing(servedPack, capture).setInstalled(AppearancePackDomain.WALLPAPER, "animes", installed = false)

        assertThat(capture.request!!.method).isEqualTo("DELETE")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/packs/wallpaper/animes/install")
    }

    @Test
    fun `the per domain catalogue reads a lossy list of shop packs from the domain address`() = runTest {
        val capture = Capture()
        val body = """{"success":true,"data":[{"slug":"essentiels","coverUrl":"/api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp"},{"slug":null},"x"]}"""

        val packs = apiServing(body, capture).catalogue(AppearancePackDomain.AVATAR_RING).data!!.packs

        assertThat(capture.request!!.method).isEqualTo("GET")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/packs/avatar-ring")
        assertThat(packs.map { it.slug }).containsExactly("essentiels")
        assertThat(packs.single().coverPath).isEqualTo("/api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp")
    }
}

