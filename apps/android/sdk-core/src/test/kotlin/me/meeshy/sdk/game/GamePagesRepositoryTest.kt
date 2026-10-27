package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.net.api.GameApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GamePagesRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<GameApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = GamePagesRepository(api, cache(), clock)

    private fun week(points: Int): JsonElement = buildJsonObject {
        put("weekKey", "2026-10-26")
        put("snapshotDay", "2026-10-27")
        put("closes", buildJsonObject { put("dayKey", "2026-11-01"); put("minuteOfDay", 1200) })
        put("placed", true)
        put("league", "jade")
        put("groupId", "g1")
        put("entries", kotlinx.serialization.json.JsonArray(listOf(
            buildJsonObject {
                put("rank", 1); put("displayName", "Aube"); put("weekPoints", points)
                put("zone", "promotion"); put("isMe", true)
            },
        )))
    }

    @Test fun `a froid le classement est Empty puis servi tel que la passerelle le sert`() = runTest {
        coEvery { api.leagueWeek() } returns ApiResponse(success = true, data = week(120))

        val results = repository().leagueWeek().take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        val served = (results[1] as CacheResult.Fresh).value
        assertThat(served.entries.single().weekPoints).isEqualTo(120)
        assertThat(served.entries.single().isMe).isTrue()
    }

    @Test fun `sur cache non vide le classement se peint hors ligne et l echec est dit`() = runTest {
        coEvery { api.leagueWeek() } returns ApiResponse(success = true, data = week(7))
        repository().refreshLeagueWeek()
        clock.now += 60 * 60_000
        coEvery { api.leagueWeek() } throws IOException("hors ligne")
        val errors = mutableListOf<Throwable>()

        val first = repository().leagueWeek { errors += it }.first()

        assertThat((first as CacheResult.Stale).value.entries.single().weekPoints).isEqualTo(7)
    }

    @Test fun `une charge illisible n est jamais gardee`() = runTest {
        coEvery { api.leagueWeek() } returns ApiResponse(success = true, data = JsonPrimitive("n'importe quoi"))

        val outcome = runCatching { repository().refreshLeagueWeek() }

        assertThat(outcome.exceptionOrNull()).isInstanceOf(GamePagesRepository.UnreadableGamePayloadException::class.java)
        assertThat(cache().get("game-pages", "league-week", JsonElement.serializer())).isNull()
    }

    @Test fun `quitter la ligue retire le classement du disque sans toucher a la ligue des amis`() = runTest {
        coEvery { api.leagueWeek() } returns ApiResponse(success = true, data = week(1))
        coEvery { api.leagueFriends() } returns ApiResponse(
            success = true,
            data = buildJsonObject {
                put("weekKey", "2026-10-26")
                put("closes", buildJsonObject { put("dayKey", "2026-11-01"); put("minuteOfDay", 1200) })
                put("entries", kotlinx.serialization.json.JsonArray(emptyList()))
            },
        )
        val repository = repository()
        repository.refreshLeagueWeek()
        repository.refreshFriendsLeague()

        repository.forgetLeagueWeek()

        assertThat(cache().get("game-pages", "league-week", JsonElement.serializer())).isNull()
        assertThat(cache().get("game-pages", "league-friends", JsonElement.serializer())).isNotNull()
    }

    @Test fun `la deconnexion vide tout ce que le jeu a garde`() = runTest {
        coEvery { api.leagueWeek() } returns ApiResponse(success = true, data = week(1))
        val repository = repository()
        repository.refreshLeagueWeek()

        repository.clear()

        assertThat(cache().get("game-pages", "league-week", JsonElement.serializer())).isNull()
    }

    @Test fun `masquer le jeu rend les deux interrupteurs confirmes par la passerelle`() = runTest {
        coEvery { api.setPrivacy(any()) } returns ApiResponse(
            success = true,
            data = buildJsonObject { put("gameHidden", true); put("friendsLeagueOptOut", false) },
        )

        val confirmed = repository().setPrivacy(requestId = "req-12345678", gameHidden = true)

        val done = (confirmed as GameWriteOutcome.Done).value
        assertThat(done.gameHidden).isTrue()
        assertThat(done.friendsLeagueOptOut).isFalse()
        coVerify { api.setPrivacy(match { it.requestId == "req-12345678" && it.gameHidden == true && it.friendsLeagueOptOut == null }) }
    }

    @Test fun `une coupure dit qu aucun geste n est parti et un refus garde le code de la passerelle`() = runTest {
        coEvery { api.setLeagueConsent(any()) } throws IOException("hors ligne")

        val offline = repository().setLeagueConsent(requestId = "req-12345678", consent = true)

        assertThat(offline).isEqualTo(GameWriteOutcome.Refused(code = "NETWORK", offline = true))
    }

    @Test fun `fermer les visibilites met les quatre facettes a moi seul et rend celles du serveur`() = runTest {
        coEvery { api.setVisibility(any()) } returns ApiResponse(
            success = true,
            data = buildJsonObject {
                put("visibility", buildJsonObject { put("showcase", "me"); put("rank", "me"); put("treasury", "me"); put("atlas", "me") })
            },
        )

        val closed = repository().closeVisibility(requestId = "req-12345678")

        assertThat((closed as GameWriteOutcome.Done).value.visibility.showcase).isEqualTo(ShowcaseVisibility.Me)
        val me = ShowcaseVisibility.Me
        coVerify {
            api.setVisibility(match { it.requestId == "req-12345678" && it.showcase == me && it.rank == me && it.treasury == me && it.atlas == me })
        }
    }
}
