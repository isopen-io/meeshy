package me.meeshy.sdk.engagement

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.put
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.EngagementApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class EngagementProgressRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<EngagementApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = EngagementProgressRepository(api, cache(), clock)

    private fun payload(score: Int): JsonElement = buildJsonObject {
        put("counters", JsonArray(emptyList()))
        put("milestones", JsonArray(emptyList()))
        put("streak", buildJsonObject { put("currentStreakDays", 2); put("longestStreakDays", 5) })
        put("level", buildJsonObject { put("engagementScore", score) })
    }

    @Test fun `a froid la progression est Empty puis servie`() = runTest {
        coEvery { api.progress() } returns ApiResponse(success = true, data = payload(120))

        val results = repository().progress().take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value.level.engagementScore).isEqualTo(120)
    }

    @Test fun `sur cache non vide aucune attente, meme hors ligne, et l echec est dit`() = runTest {
        coEvery { api.progress() } returns ApiResponse(success = true, data = payload(7))
        repository().refresh()
        clock.now += 60 * 60_000
        coEvery { api.progress() } throws IOException("hors ligne")
        val errors = mutableListOf<Throwable>()

        val first = repository().progress { errors += it }.first()

        assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((first as CacheResult.Stale).value.level.engagementScore).isEqualTo(7)
    }

    @Test fun `une charge illisible n est jamais gardee`() = runTest {
        coEvery { api.progress() } returns ApiResponse(success = true, data = JsonPrimitive("n'importe quoi"))

        val outcome = runCatching { repository().refresh() }

        assertThat(outcome.exceptionOrNull())
            .isInstanceOf(EngagementProgressRepository.UnreadableProgressException::class.java)
        assertThat(cache().get("engagement", "me", JsonElement.serializer())).isNull()
    }

    @Test fun `la deconnexion vide la progression du compte`() = runTest {
        coEvery { api.progress() } returns ApiResponse(success = true, data = payload(1))
        val repository = repository()
        repository.refresh()

        repository.clear()

        assertThat(cache().get("engagement", "me", JsonElement.serializer())).isNull()
    }

    private fun payloadWithRarities(): JsonElement = buildJsonObject {
        put("counters", JsonArray(emptyList()))
        put("milestones", JsonArray(emptyList()))
        put("streak", buildJsonObject { put("currentStreakDays", 2); put("longestStreakDays", 5) })
        put("level", buildJsonObject { put("engagementScore", 9) })
        put(
            "game",
            buildJsonObject {
                put(
                    "achievementRarities",
                    buildJsonObject {
                        put("achievement.first_content", buildJsonObject { put("rarity", "epic"); put("holders", 4000); put("population", 100000) })
                    },
                )
            },
        )
    }

    @Test fun `les raretes du dernier bloc se lisent au disque seul, sans aucun appel reseau`() = runTest {
        coEvery { api.progress() } returns ApiResponse(success = true, data = payloadWithRarities())
        repository().refresh()
        coEvery { api.progress() } throws IOException("hors ligne")

        val rarities = repository().cachedRarities()

        assertThat(rarities!!.getValue("achievement.first_content").holders).isEqualTo(4000)
    }

    @Test fun `a froid ou sans bloc de jeu, aucune rarete`() = runTest {
        assertThat(repository().cachedRarities()).isNull()
        coEvery { api.progress() } returns ApiResponse(success = true, data = payload(1))
        repository().refresh()

        assertThat(repository().cachedRarities()).isNull()
    }
}
