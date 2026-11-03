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
 * Les routes du moteur générique des packs, CAPTURÉES au dernier maillon : `/sticker-packs` reste inchangé à l'octet,
 * les autres domaines parlent à `/packs/<domaine>`, et `/pack-assets/<fichier>` sert les fichiers adressés par contenu.
 */
class PackRawApiRoutesTest {
    private val baseUrl = "https://gate.staging.meeshy.me/api/v1/"

    private class Capture {
        val requests = mutableListOf<Request>()
        val last: String get() = requests.last().let { "${it.method} ${it.url.encodedPath}" }
    }

    private fun retrofit(capture: Capture) = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(
            OkHttpClient.Builder()
                .addInterceptor { chain ->
                    capture.requests += chain.request()
                    Response.Builder()
                        .request(chain.request())
                        .protocol(Protocol.HTTP_1_1)
                        .code(200)
                        .message("OK")
                        .body("""{"success":true,"data":[{"slug":"a"}]}""".toResponseBody("application/json".toMediaType()))
                        .build()
                }
                .build(),
        )
        .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
        .build()

    @Test
    fun `les stickers gardent leurs adresses a l'octet`() = runTest {
        val capture = Capture()
        val api = retrofit(capture).create(StickerPackRawApi::class.java)

        api.catalogue()
        assertThat(capture.last).isEqualTo("GET /api/v1/sticker-packs")
        api.installed()
        assertThat(capture.last).isEqualTo("GET /api/v1/sticker-packs/installed")
        api.detail("fruits")
        assertThat(capture.last).isEqualTo("GET /api/v1/sticker-packs/fruits")
        api.install("fruits")
        assertThat(capture.last).isEqualTo("PUT /api/v1/sticker-packs/fruits/install")
        api.uninstall("fruits")
        assertThat(capture.last).isEqualTo("DELETE /api/v1/sticker-packs/fruits/install")
    }

    @Test
    fun `les autres domaines parlent a packs par domaine`() = runTest {
        val capture = Capture()
        val api = retrofit(capture).create(PackRawApi::class.java)

        api.catalogue("glory-frame")
        assertThat(capture.last).isEqualTo("GET /api/v1/packs/glory-frame")
        api.installed("banner-frame")
        assertThat(capture.last).isEqualTo("GET /api/v1/packs/banner-frame/installed")
        api.detail("wallpaper", "animes")
        assertThat(capture.last).isEqualTo("GET /api/v1/packs/wallpaper/animes")
        api.install("avatar-ring", "or")
        assertThat(capture.last).isEqualTo("PUT /api/v1/packs/avatar-ring/or/install")
        api.uninstall("banner", "nuit")
        assertThat(capture.last).isEqualTo("DELETE /api/v1/packs/banner/nuit/install")
    }

    @Test
    fun `les fichiers de pack se lisent par leur adresse de contenu`() = runTest {
        val capture = Capture()
        val api = retrofit(capture).create(PackAssetsApi::class.java)

        api.file("aaaaaaaaaaaaaaaa.webp")

        assertThat(capture.last).isEqualTo("GET /api/v1/pack-assets/aaaaaaaaaaaaaaaa.webp")
    }
}
