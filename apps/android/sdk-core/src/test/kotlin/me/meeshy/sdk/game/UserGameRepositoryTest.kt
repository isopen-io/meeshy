package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.net.api.GameApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Le jeu d'un AUTRE membre : lu depuis ce que la passerelle sert selon SES réglages, cache d'abord, jamais fabriqué. Une
 * réponse du serveur — refus compris — efface la copie gardée ; seule une panne de transport la rouvre (conformité D-5).
 */
@RunWith(RobolectricTestRunner::class)
class UserGameRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val api = mockk<GameApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun repository() = UserGameRepository(api, KeyedJsonCache(db.keyedJsonCacheDao(), FakeClock()))

    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    private val served = json("""{"visible":true,"standing":{"level":42,"tier":"eclat","prestige":2,"flame":null,"rank":"voix","division":2},"treasury":null}""")
    private val refused = json("""{"visible":false,"standing":null,"treasury":null}""")

    @Test
    fun `le niveau et le rang servis se lisent, puis reviennent du disque sans reseau`() = runTest {
        coEvery { api.userGame("u1") } returns ApiResponse(success = true, data = served)
        val repository = repository()

        val fresh = repository.load("u1")!!

        assertThat(fresh.standing?.shownLevel).isEqualTo(42)
        assertThat(fresh.standing?.rank).isEqualTo(GloryRank.Voix)
        assertThat(repository.cached("u1")).isEqualTo(fresh)
    }

    @Test
    fun `a froid rien n'est peint, et un membre n'a jamais la copie d'un autre`() = runTest {
        coEvery { api.userGame("u1") } returns ApiResponse(success = true, data = served)
        val repository = repository()
        repository.load("u1")

        assertThat(repository.cached("u2")).isNull()
        assertThat(repository().cached("u1")).isNotNull()
    }

    @Test
    fun `un refus servi ne montre rien et efface la copie gardee`() = runTest {
        coEvery { api.userGame("u1") } returnsMany listOf(
            ApiResponse(success = true, data = served),
            ApiResponse(success = true, data = refused),
        )
        val repository = repository()
        repository.load("u1")

        assertThat(repository.load("u1")).isNull()
        assertThat(repository.cached("u1")).isNull()
    }

    @Test
    fun `une panne de transport rouvre la copie du disque, jamais une reponse du serveur`() = runTest {
        coEvery { api.userGame("u1") } returnsMany listOf(ApiResponse(success = true, data = served))
        val repository = repository()
        repository.load("u1")
        coEvery { api.userGame("u1") } throws IOException("hors ligne")

        assertThat(repository.load("u1")?.standing?.shownLevel).isEqualTo(42)
    }

    @Test
    fun `une erreur du serveur oublie la copie gardee plutot que de la rouvrir`() = runTest {
        coEvery { api.userGame("u1") } returnsMany listOf(
            ApiResponse(success = true, data = served),
            ApiResponse(success = false, error = "interdit", code = "FORBIDDEN"),
        )
        val repository = repository()
        repository.load("u1")

        assertThat(repository.load("u1")).isNull()
        assertThat(repository.cached("u1")).isNull()
    }

    @Test
    fun `un identifiant qui n'est pas un segment sur ne part jamais`() = runTest {
        val repository = repository()

        assertThat(repository.load("../me")).isNull()
        assertThat(repository.cached("a/b")).isNull()
        coVerify(exactly = 0) { api.userGame(any()) }
    }

    @Test
    fun `se deconnecter vide le jeu des autres`() = runTest {
        coEvery { api.userGame("u1") } returns ApiResponse(success = true, data = served)
        val repository = repository()
        repository.load("u1")

        repository.clear()

        assertThat(repository.cached("u1")).isNull()
    }
}
