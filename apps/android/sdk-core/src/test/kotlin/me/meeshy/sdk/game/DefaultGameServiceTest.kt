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
import me.meeshy.sdk.model.game.GameErrorCode
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.net.api.GameApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class DefaultGameServiceTest {

    private val api = mockk<GameApi>()
    private val service = DefaultGameService(api)

    private fun ok(json: String) = ApiResponse<JsonElement>(success = true, data = Json.parseToJsonElement(json))

    private fun http(status: Int, body: String = "{}") =
        HttpException(Response.error<Any>(status, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun `ouvrir le coffre poste l identifiant et rend la recompense`() = runTest {
        coEvery { api.claimChest(GameWriteRequest("req-12345678")) } returns
            ok("""{"status":"claimed","reward":{"points":900,"fragment":false,"freeze":true},"score":4200}""")

        val result = service.claimChest("req-12345678")

        assertThat((result as GameServiceResult.Done).value.reward.points).isEqualTo(900)
    }

    @Test
    fun `un statut inconnu d une ecriture deja faite se lit quand meme`() = runTest {
        coEvery { api.buyFlameFreeze(any()) } returns ok("""{"status":"already-bought","freezes":2,"balance":5,"extra":1}""")

        val done = service.buyFlameFreeze("req-12345678") as GameServiceResult.Done

        assertThat(done.value.alreadyDone).isTrue()
    }

    @Test
    fun `les cinq ecritures du lot un partent sur leur route`() = runTest {
        coEvery { api.rerollMission("m1", any()) } returns ok("""{"mission":{"id":"m1"},"balance":3}""")
        coEvery { api.relightFlame(any()) } returns ok("""{"status":"relit","streak":4,"balance":1}""")
        coEvery { api.markGuideSeen(any()) } returns ok("""{"guideSeen":["a"]}""")

        service.rerollMission("m1", "req-12345678")
        service.relightFlame("req-12345678")
        val seen = service.markGuideSeen(listOf("a"), "req-12345678") as GameServiceResult.Done

        assertThat(seen.value.guideSeen).containsExactly("a")
        coVerify(exactly = 1) { api.relightFlame(GameWriteRequest("req-12345678")) }
    }

    @Test
    fun `un refus 409 rend le code du contrat`() = runTest {
        coEvery { api.buyFlameFreeze(any()) } throws http(409, """{"code":"FREEZE_AT_MAXIMUM"}""")

        val result = service.buyFlameFreeze("req-12345678") as GameServiceResult.Refused

        assertThat(result.refusal.code).isEqualTo(GameErrorCode.FreezeAtMaximum)
    }

    @Test
    fun `un 409 de code inconnu et un 500 ne sont pas des refus`() = runTest {
        coEvery { api.claimChest(any()) } throws http(409, """{"code":"NEW_ONE"}""")
        coEvery { api.relightFlame(any()) } throws http(500)

        assertThat(service.claimChest("req-12345678")).isEqualTo(GameServiceResult.Failed(409))
        assertThat(service.relightFlame("req-12345678")).isEqualTo(GameServiceResult.Failed(500))
    }

    @Test
    fun `une coupure dit que rien n est parti`() = runTest {
        coEvery { api.claimChest(any()) } throws IOException("down")

        assertThat(service.claimChest("req-12345678")).isEqualTo(GameServiceResult.Offline)
    }

    @Test
    fun `un identifiant de chemin dangereux ne part pas`() = runTest {
        assertThat(service.rerollMission("../x", "req-12345678")).isEqualTo(GameServiceResult.Failed(null))
        coVerify(exactly = 0) { api.rerollMission(any(), any()) }
    }

    @Test
    fun `une route de la vague deux absente est masquee et non en erreur`() = runTest {
        coEvery { api.leagueWeek() } throws http(404)
        coEvery { api.passPrestige(any()) } throws http(404)
        coEvery { api.settings() } throws http(404)

        assertThat(service.fetchLeagueWeek()).isEqualTo(GameServiceResult.Unavailable)
        assertThat(service.passPrestige("req-12345678")).isEqualTo(GameServiceResult.Unavailable)
        assertThat(service.fetchSettings()).isEqualTo(GameServiceResult.Unavailable)
    }

    @Test
    fun `le calendrier et les archives en 404 rendent Unavailable`() = runTest {
        coEvery { api.seasonCalendar(any()) } returns Response.error(404, "".toResponseBody())
        coEvery { api.seasonArchive(3) } throws http(404)
        coEvery { api.leagueWeekArchive("2026-10-26") } throws http(404)

        assertThat(service.fetchSeasonCalendar()).isEqualTo(GameServiceResult.Unavailable)
        assertThat(service.fetchSeasonArchive(3)).isEqualTo(GameServiceResult.Unavailable)
        assertThat(service.fetchLeagueWeekArchive("2026-10-26")).isEqualTo(GameServiceResult.Unavailable)
    }

    @Test
    fun `le calendrier garde l ETag et un 304 confirme la copie`() = runTest {
        val body = ApiResponse<JsonElement>(success = true, data = Json.parseToJsonElement("""{"seasons":[]}"""))
        coEvery { api.seasonCalendar(null) } returns Response.success(body, okhttp3.Headers.headersOf("ETag", "W/\"1\""))
        coEvery { api.seasonCalendar("W/\"1\"") } returns Response.error(
            "".toResponseBody(),
            okhttp3.Response.Builder()
                .request(okhttp3.Request.Builder().url("http://localhost/").build())
                .protocol(okhttp3.Protocol.HTTP_1_1).code(304).message("Not Modified").build(),
        )

        val fresh = (service.fetchSeasonCalendar() as GameServiceResult.Done).value as GameSeasonCalendarRead.Fresh
        val again = service.fetchSeasonCalendar("W/\"1\"")

        assertThat(fresh.etag).isEqualTo("W/\"1\"")
        assertThat(again).isEqualTo(GameServiceResult.Done(GameSeasonCalendarRead.NotModified))
    }

    @Test
    fun `un refus de la vague deux garde son code meme opt-in`() = runTest {
        coEvery { api.buySeasonSeal(any()) } throws http(409, """{"code":"SEAL_ALREADY_OWNED"}""")

        val result = service.buySeasonSeal("req-12345678") as GameServiceResult.Refused

        assertThat(result.refusal.code).isEqualTo(GameErrorCode.SealAlreadyOwned)
    }
}
