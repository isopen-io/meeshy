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

    @Test fun `ranger la vitrine envoie l ordre complet avec son identifiant et rend l ordre de la passerelle`() = runTest {
        coEvery { api.setShowcaseOrder(any()) } returns ApiResponse(
            success = true,
            data = buildJsonObject { put("order", kotlinx.serialization.json.JsonArray(listOf(JsonPrimitive("b"), JsonPrimitive("a")))) },
        )

        val outcome = repository().setShowcaseOrder("req-12345678", listOf("b", "a"))

        assertThat((outcome as GameWriteOutcome.Done).value.order).containsExactly("b", "a").inOrder()
        coVerify { api.setShowcaseOrder(match { it.requestId == "req-12345678" && it.order == listOf("b", "a") }) }
    }

    @Test fun `regler une facette n envoie que celle-la`() = runTest {
        coEvery { api.setVisibility(any()) } returns ApiResponse(
            success = true,
            data = buildJsonObject {
                put("visibility", buildJsonObject { put("showcase", "me"); put("rank", "me"); put("treasury", "me"); put("atlas", "friends") })
            },
        )

        val outcome = repository().setVisibility(
            me.meeshy.sdk.model.game.ShowcaseVisibilityRequest("req-12345678", atlas = ShowcaseVisibility.Friends),
        )

        assertThat((outcome as GameWriteOutcome.Done).value.visibility.atlas).isEqualTo(ShowcaseVisibility.Friends)
        coVerify { api.setVisibility(match { it.atlas == ShowcaseVisibility.Friends && it.showcase == null && it.rank == null && it.treasury == null }) }
    }

    @Test fun `l alliance s invite, s accepte et se quitte par l identifiant de la passerelle`() = runTest {
        coEvery { api.inviteToDuo(any()) } returns ApiResponse(
            success = true,
            data = buildJsonObject { put("status", "invited"); put("duoId", "duo1"); put("weekKey", "2026-10-26") },
        )
        coEvery { api.acceptDuo("duo1", any()) } returns ApiResponse(success = true, data = buildJsonObject { put("status", "active"); put("duoId", "duo1") })
        coEvery { api.abandonDuo("duo1", any()) } returns ApiResponse(success = true, data = buildJsonObject { put("status", "abandoned"); put("duoId", "duo1") })
        val repository = repository()

        val invited = repository.inviteToDuo("req-1234567a", "friend1")
        val accepted = repository.acceptDuo("req-1234567b", "duo1")
        val left = repository.abandonDuo("req-1234567c", "duo1")

        assertThat((invited as GameWriteOutcome.Done).value.duoId).isEqualTo("duo1")
        assertThat((accepted as GameWriteOutcome.Done).value.status).isEqualTo("active")
        assertThat((left as GameWriteOutcome.Done).value.status).isEqualTo("abandoned")
        coVerify { api.inviteToDuo(match { it.requestId == "req-1234567a" && it.friendId == "friend1" }) }
    }

    @Test fun `un identifiant d alliance qui ne passe pas dans un chemin ne part pas`() = runTest {
        val outcome = repository().acceptDuo("req-12345678", "../x")

        assertThat(outcome).isEqualTo(GameWriteOutcome.Refused(code = null, offline = false))
        coVerify(exactly = 0) { api.acceptDuo(any(), any()) }
    }

    @Test fun `changer le nom de joute rend le nom de la passerelle et un refus garde son code`() = runTest {
        coEvery { api.setLeaguePseudonym(any()) } returns ApiResponse(success = true, data = buildJsonObject { put("pseudonym", "Aube_7") })

        val outcome = repository().setLeaguePseudonym("req-12345678", "Aube_7")

        assertThat((outcome as GameWriteOutcome.Done).value.pseudonym).isEqualTo("Aube_7")
        coVerify { api.setLeaguePseudonym(match { it.requestId == "req-12345678" && it.pseudonym == "Aube_7" }) }
    }
}
