package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringBlockBody
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.model.relation.BringStoppedEvent
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.model.relation.TalkieBlockBody
import me.meeshy.sdk.net.api.BringApi
import me.meeshy.sdk.net.api.BringStopResponse
import me.meeshy.sdk.net.api.RelationsApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** Le Bring de l'expéditeur (#16617) : la passerelle décide, le dépôt range ses refus et suit ce qui sonne. */
class BringRepositoryTest {

    private val api = mockk<BringApi>()
    private val relations = mockk<RelationsApi>()
    private val stopped = MutableSharedFlow<BringStoppedEvent>(extraBufferCapacity = 4)

    private fun TestScope.repository() = BringRepository(
        api = api,
        relations = relations,
        stopped = stopped,
        scope = backgroundScope,
        now = { currentTime },
    )

    private fun http(code: Int) = HttpException(Response.error<Any>(code, "{}".toResponseBody()))

    private fun TestScope.sent(id: String = "b1", windowMs: Long = 120_000) = BringSent(
        bringId = id,
        toUserId = "u2",
        sentAt = Instant.ofEpochMilli(currentTime).toString(),
        expiresAt = Instant.ofEpochMilli(currentTime + windowMs).toString(),
        perDay = 3,
        remainingToday = 2,
    )

    @Test
    fun `la disponibilite servie est rendue, une panne ne fabrique rien`() = runTest {
        val repository = repository()
        coEvery { api.availability("u2") } returns ApiResponse(success = true, data = BringAvailability("u2", true, 3, 3))
        assertThat(repository.availability("u2")?.remainingToday).isEqualTo(3)

        coEvery { api.availability("u2") } throws IOException("hors ligne")
        assertThat(repository.availability("u2")).isNull()
    }

    @Test
    fun `une disponibilite servie pour une autre personne est ecartee`() = runTest {
        coEvery { api.availability("u2") } returns ApiResponse(success = true, data = BringAvailability("u3", true, 3, 3))
        assertThat(repository().availability("u2")).isNull()
    }

    @Test
    fun `chaque refus est range par ce que l'ecran en dit, sans dire bloque`() = runTest {
        val repository = repository()
        coEvery { api.send("u2") } throws http(403)
        assertThat(repository.send("u2")).isEqualTo(BringSendOutcome.Gone)
        coEvery { api.send("u2") } throws http(429)
        assertThat(repository.send("u2")).isEqualTo(BringSendOutcome.Quota)
        coEvery { api.send("u2") } throws http(503)
        assertThat(repository.send("u2")).isEqualTo(BringSendOutcome.Failed)
        coEvery { api.send("u2") } throws IOException("hors ligne")
        assertThat(repository.send("u2")).isEqualTo(BringSendOutcome.Offline)
        assertThat(repository.outgoing.value).isEmpty()
    }

    @Test
    fun `un envoi reussi sonne chez l'autre jusqu'a l'arret servi par la socket`() = runTest {
        val repository = repository()
        runCurrent()
        val ringing = sent()
        coEvery { api.send("u2") } returns ApiResponse(success = true, data = ringing)

        assertThat(repository.send("u2")).isEqualTo(BringSendOutcome.Sent(ringing))
        assertThat(repository.outgoing.value["u2"]).isEqualTo(ringing)

        stopped.emit(BringStoppedEvent(bringId = "b1", reason = "recipient"))
        runCurrent()
        assertThat(repository.outgoing.value).isEmpty()
    }

    @Test
    fun `l'arret d'un autre Bring ne fait pas taire celui-ci`() = runTest {
        val repository = repository()
        runCurrent()
        coEvery { api.send("u2") } returns ApiResponse(success = true, data = sent())
        repository.send("u2")

        stopped.emit(BringStoppedEvent(bringId = "autre"))
        runCurrent()
        assertThat(repository.outgoing.value).containsKey("u2")
    }

    @Test
    fun `a son echeance la sonnerie cesse sans evenement`() = runTest {
        val repository = repository()
        coEvery { api.send("u2") } returns ApiResponse(success = true, data = sent(windowMs = 60_000))
        repository.send("u2")

        advanceTimeBy(59_000)
        assertThat(repository.outgoing.value).containsKey("u2")
        advanceTimeBy(2_000)
        assertThat(repository.outgoing.value).isEmpty()
    }

    @Test
    fun `annuler est optimiste puis arrete la sonnerie chez l'autre`() = runTest {
        val repository = repository()
        coEvery { api.send("u2") } returns ApiResponse(success = true, data = sent())
        coEvery { api.stop("b1") } returns ApiResponse(success = true, data = BringStopResponse("b1", true))
        repository.send("u2")

        repository.cancel("u2")
        assertThat(repository.outgoing.value).isEmpty()
        runCurrent()
        coVerify(exactly = 1) { api.stop("b1") }
    }

    @Test
    fun `le blocage par personne s'ecrit en un seul champ, et un refus rend null`() = runTest {
        val repository = repository()
        coEvery { relations.settings("u2") } returns ApiResponse(success = true, data = RelationPersonSettings("u2", false))
        coEvery { relations.setBringBlocked("u2", BringBlockBody(true)) } returns
            ApiResponse(success = true, data = RelationPersonSettings("u2", true))

        assertThat(repository.personSettings("u2")?.bringBlocked).isFalse()
        assertThat(repository.setReceptionBlocked("u2", RelationReceptionSetting.BRING, blocked = true)?.bringBlocked).isTrue()

        coEvery { relations.setBringBlocked("u2", BringBlockBody(false)) } throws http(500)
        assertThat(repository.setReceptionBlocked("u2", RelationReceptionSetting.BRING, blocked = false)).isNull()
    }

    @Test
    fun `couper le talkie d'une personne ecrit son seul champ, jamais celui du Bring`() = runTest {
        val repository = repository()
        coEvery { relations.setTalkieBlocked("u2", TalkieBlockBody(true)) } returns
            ApiResponse(success = true, data = RelationPersonSettings("u2", bringBlocked = false, talkieBlocked = true))

        val served = repository.setReceptionBlocked("u2", RelationReceptionSetting.TALKIE, blocked = true)

        assertThat(served?.isBlocked(RelationReceptionSetting.TALKIE)).isTrue()
        assertThat(served?.isBlocked(RelationReceptionSetting.BRING)).isFalse()
        coVerify(exactly = 0) { relations.setBringBlocked(any(), any()) }
    }
}
