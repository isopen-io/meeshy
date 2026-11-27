package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.PhotoMomentsPresentedResponse
import me.meeshy.sdk.model.game.PhotoMomentsRequest
import me.meeshy.sdk.net.api.GameApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

/** L'accusé d'une invitation présentée (#20651, iso de `acknowledgePhotoMomentsPresented` iOS). */
class GamePhotoRegistryServiceTest {

    private val api = mockk<GameApi>()
    private val service: GamePhotoRegistryServiceProviding = DefaultGameService(api)

    private fun ok(json: String) = Response.success(ApiResponse<JsonElement>(success = true, data = Json.parseToJsonElement(json)))

    @Test
    fun `l'accuse part vers le registre avec l'intention et les etapes et rend la premiere presentation`() = runTest {
        val request = PhotoMomentsRequest("req-photo-0001", listOf("rank:voix:3"))
        coEvery { api.markPhotoMomentsPresented(request) } returns
            ok("""{"presented":[{"stepId":"rank:voix:3","presentedAt":"2026-11-27T08:00:00.000Z"}]}""")

        val result = service.acknowledgePhotoMomentsPresented(listOf("rank:voix:3"), "req-photo-0001")

        assertThat((result as GameServiceResult.Done).value).isEqualTo(
            PhotoMomentsPresentedResponse(listOf(PhotoMomentsPresentedResponse.Entry("rank:voix:3", "2026-11-27T08:00:00.000Z"))),
        )
        coVerify(exactly = 1) { api.markPhotoMomentsPresented(request) }
    }

    @Test
    fun `un serveur anterieur sans la route masque l'accuse au lieu de lever`() = runTest {
        coEvery { api.markPhotoMomentsPresented(any()) } returns
            Response.error(404, "{}".toResponseBody("application/json".toMediaType()))

        assertThat(service.acknowledgePhotoMomentsPresented(listOf("meesh:10"), "req-photo-0002"))
            .isEqualTo(GameServiceResult.Unavailable)
    }

    @Test
    fun `une coupure dit hors ligne et une reponse illisible n'invente rien`() = runTest {
        coEvery { api.markPhotoMomentsPresented(any()) } throws IOException("coupure")
        assertThat(service.acknowledgePhotoMomentsPresented(listOf("meesh:10"), "req-photo-0003"))
            .isEqualTo(GameServiceResult.Offline)

        coEvery { api.markPhotoMomentsPresented(any()) } returns ok("""{"presented":[{"stepId":"meesh:10"}]}""")
        assertThat(service.acknowledgePhotoMomentsPresented(listOf("meesh:10"), "req-photo-0004"))
            .isEqualTo(GameServiceResult.Failed(null))
    }
}
