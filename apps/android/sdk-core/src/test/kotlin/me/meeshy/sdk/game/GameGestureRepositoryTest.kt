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
import me.meeshy.sdk.model.game.ChestClaimResponse
import me.meeshy.sdk.model.game.FlameGoalRequest
import me.meeshy.sdk.model.game.FlameGoalResponse
import me.meeshy.sdk.model.game.FlamePauseRequest
import me.meeshy.sdk.model.game.FlamePauseResponse
import me.meeshy.sdk.model.game.GameFlamePause
import me.meeshy.sdk.model.game.GameServedFlameGoal
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.model.game.GuideSeenRequest
import me.meeshy.sdk.model.game.GuideSeenResponse
import me.meeshy.sdk.net.api.EngagementApi
import me.meeshy.sdk.net.api.GameApi
import me.meeshy.sdk.net.api.MeeshMintRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class GameGestureRepositoryTest {

    private val game = mockk<GameApi>()
    private val engagement = mockk<EngagementApi>()
    private val repository = GameGestureRepository(game, engagement)

    private fun ok(json: String) = ApiResponse<JsonElement>(success = true, data = Json.parseToJsonElement(json))

    private fun conflict(code: String) = HttpException(
        Response.error<Unit>(409, """{"success":false,"error":"x","code":"$code"}""".toResponseBody("application/json".toMediaType())),
    )

    @Test
    fun `ouvrir le coffre poste l identifiant et rend la recompense servie`() = runTest {
        coEvery { game.claimChest(GameWriteRequest("req-12345678")) } returns
            ok("""{"status":"claimed","reward":{"points":900,"fragment":false,"freeze":true},"score":4200}""")

        val outcome = repository.claimChest("req-12345678")

        val done = outcome as GameWriteOutcome.Done<ChestClaimResponse>
        assertThat(done.value.reward.points).isEqualTo(900)
        assertThat(done.value.score).isEqualTo(4200L)
    }

    @Test
    fun `un refus 409 garde le code du contrat`() = runTest {
        coEvery { game.buyFlameFreeze(any()) } throws conflict("FREEZE_AT_MAXIMUM")

        val outcome = repository.buyFlameFreeze("req-12345678")

        assertThat(outcome).isEqualTo(GameWriteOutcome.Refused(code = "FREEZE_AT_MAXIMUM", offline = false))
    }

    @Test
    fun `annoncer une veille poste la duree et rend la veille servie`() = runTest {
        coEvery { game.pauseFlame(FlamePauseRequest("req-12345678", 3)) } returns
            ok("""{"status":"paused","pause":{"from":"2026-10-06","until":"2026-10-08"}}""")

        val outcome = repository.pauseFlame("req-12345678", 3)

        assertThat(outcome).isEqualTo(GameWriteOutcome.Done(FlamePauseResponse("paused", GameFlamePause("2026-10-06", "2026-10-08"))))
    }

    @Test
    fun `une veille refusee garde la raison du refus`() = runTest {
        coEvery { game.pauseFlame(any()) } throws HttpException(
            Response.error<Unit>(
                409,
                """{"success":false,"error":"x","code":"FLAME_PAUSE_NOT_ALLOWED","reason":"quarterly-limit"}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )

        assertThat(repository.pauseFlame("req-12345678", 3))
            .isEqualTo(GameWriteOutcome.Refused(code = "FLAME_PAUSE_NOT_ALLOWED", offline = false, reason = "quarterly-limit"))
    }

    @Test
    fun `choisir un objectif poste la cible et rend l objectif servi`() = runTest {
        coEvery { game.chooseFlameGoal(FlameGoalRequest("req-12345678", 14)) } returns
            ok("""{"status":"chosen","goal":{"offer":[],"current":{"target":14,"remaining":13,"reached":false,"next":null}}}""")

        val outcome = repository.chooseFlameGoal("req-12345678", 14)

        assertThat(outcome).isEqualTo(
            GameWriteOutcome.Done(
                FlameGoalResponse("chosen", GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(14, 13, false, null))),
            ),
        )
    }

    @Test
    fun `un objectif refuse garde la raison du refus`() = runTest {
        coEvery { game.chooseFlameGoal(any()) } throws HttpException(
            Response.error<Unit>(
                409,
                """{"success":false,"error":"x","code":"FLAME_GOAL_NOT_ALLOWED","reason":"not-offered"}"""
                    .toResponseBody("application/json".toMediaType()),
            ),
        )

        assertThat(repository.chooseFlameGoal("req-12345678", 30))
            .isEqualTo(GameWriteOutcome.Refused(code = "FLAME_GOAL_NOT_ALLOWED", offline = false, reason = "not-offered"))
    }

    @Test
    fun `fermer le signe des aieux range la cle de l objectif atteint`() = runTest {
        coEvery { game.markGuideSeen(GuideSeenRequest("req-12345678", listOf("flame-goal-next-7"))) } returns
            ok("""{"guideSeen":["flame-goal-next-7"]}""")

        assertThat(repository.closeFlameGoalSign("req-12345678", 7))
            .isEqualTo(GameWriteOutcome.Done(GuideSeenResponse(listOf("flame-goal-next-7"))))
        coVerify { game.markGuideSeen(GuideSeenRequest("req-12345678", listOf("flame-goal-next-7"))) }
    }

    @Test
    fun `une coupure dit que rien n est parti`() = runTest {
        coEvery { game.relightFlame(any()) } throws IOException("unreachable")

        assertThat(repository.relightFlame("req-12345678")).isEqualTo(GameWriteOutcome.Refused(code = "NETWORK", offline = true))
    }

    @Test
    fun `une charge illisible n est ni un succes ni une coupure`() = runTest {
        coEvery { game.claimChest(any()) } returns ok("""{"status":"claimed"}""")

        assertThat(repository.claimChest("req-12345678")).isEqualTo(GameWriteOutcome.Refused(code = null, offline = false))
    }

    @Test
    fun `changer un acte nomme la mission et porte l identifiant`() = runTest {
        coEvery { game.rerollMission("m-1", GameWriteRequest("req-12345678")) } returns
            ok("""{"mission":{"id":"m-2","templateKey":"send_texts","difficulty":"easy","signal":"s","prism":false,"target":3,"progress":0,"reward":100,"glory":0},"balance":4}""")

        val outcome = repository.rerollMission("req-12345678", "m-1")

        assertThat((outcome as GameWriteOutcome.Done).value.balance).isEqualTo(4L)
    }

    @Test
    fun `un identifiant de mission douteux ne part jamais`() = runTest {
        val outcome = repository.rerollMission("req-12345678", "../me")

        assertThat(outcome).isEqualTo(GameWriteOutcome.Refused(code = null, offline = false))
        coVerify(exactly = 0) { game.rerollMission(any(), any()) }
    }

    @Test
    fun `la frappe porte la garde de prix quand elle est positive et l omet sinon`() = runTest {
        coEvery { engagement.mintMeesh(any()) } returns ok("""{"status":"minted","number":3,"edition":"silver"}""")

        repository.mint("req-12345678", maxPrice = 1221)
        repository.mint("req-87654321", maxPrice = 0)

        coVerify { engagement.mintMeesh(MeeshMintRequest("req-12345678", 1221)) }
        coVerify { engagement.mintMeesh(MeeshMintRequest("req-87654321", null)) }
    }

    @Test
    fun `reclamer une halte nomme son numero`() = runTest {
        coEvery { game.claimSeasonStep(7, GameWriteRequest("req-12345678")) } returns
            ok("""{"status":"claimed","step":7,"reward":{"kind":"points","amount":100},"completed":false,"gloryGained":0,"score":100}""")

        val outcome = repository.claimSeasonStep("req-12345678", 7)

        assertThat((outcome as GameWriteOutcome.Done).value.step).isEqualTo(7)
    }
}
