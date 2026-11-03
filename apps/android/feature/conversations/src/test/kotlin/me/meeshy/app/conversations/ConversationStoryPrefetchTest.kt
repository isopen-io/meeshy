package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaAutoDownloadDecider
import me.meeshy.sdk.model.MediaAvailability
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationStoryPrefetchTest {

    private fun media(id: String, type: FeedMediaType = FeedMediaType.IMAGE, url: String? = "u://$id") =
        FeedMedia(id = id, type = type, url = url)

    private fun group(index: Int, stories: List<List<FeedMedia>>) = StoryGroup(
        id = "g$index",
        stories = stories.mapIndexed { i, m -> StoryItem(id = "g$index-s$i", media = m) },
    )

    private class Source(
        var cached: Boolean = false,
        var groups: List<StoryGroup>? = emptyList(),
    ) : StoryPrefetchSource {
        var fetches = 0
        var saves = 0
        override suspend fun isTrayCached() = cached
        override suspend fun fetchGroups(limit: Int): List<StoryGroup>? {
            fetches += 1
            return groups
        }
        override suspend fun saveTray() { saves += 1 }
    }

    private class Media(val hold: CompletableDeferred<Unit>? = null) : StoryMediaPrefetcher {
        val images = mutableListOf<String>()
        val videos = mutableListOf<String>()
        var inFlight = 0
        var maxInFlight = 0
        override suspend fun image(url: String) = track { images += url }
        override suspend fun video(url: String) = track { videos += url }
        private suspend fun track(record: () -> Unit) {
            inFlight += 1
            maxInFlight = maxOf(maxInFlight, inFlight)
            record()
            hold?.await()
            inFlight -= 1
        }
    }

    private fun TestScope.prefetch(source: Source, media: Media, gate: StoryPrefetchGate = StoryPrefetchGate.Open) =
        ConversationStoryPrefetch(source, media, { gate }, StandardTestDispatcher(testScheduler))

    @Test
    fun `trente groupes au plus, tout des trois premiers puis deux stories par groupe`() {
        val groups = (0 until 35).map { g ->
            group(g, (0 until 4).map { s -> listOf(media("g$g-s$s")) })
        }

        val plan = StoryPrefetchPlan.of(groups)

        assertThat(plan.images).contains("u://g0-s3")
        assertThat(plan.images).contains("u://g2-s3")
        assertThat(plan.images).contains("u://g3-s1")
        assertThat(plan.images).doesNotContain("u://g3-s2")
        assertThat(plan.images).doesNotContain("u://g30-s0")
        assertThat(plan.images).hasSize(3 * 4 + 27 * 2)
    }

    @Test
    fun `les videos se separent des images, sans doublon ni url vide`() {
        val plan = StoryPrefetchPlan.of(
            listOf(
                group(0, listOf(listOf(media("a"), media("b", FeedMediaType.VIDEO), media("a"), media("c", url = ""), media("d", url = null)))),
            ),
        )

        assertThat(plan.images).containsExactly("u://a")
        assertThat(plan.videos).containsExactly("u://b")
    }

    @Test
    fun `les images partent par lots de huit puis les videos par lots de quatre`() = runTest {
        val hold = CompletableDeferred<Unit>()
        val images = (0 until 20).map { media("i$it") }
        val videos = (0 until 6).map { media("v$it", FeedMediaType.VIDEO) }
        val source = Source(groups = listOf(group(0, listOf(images + videos))))
        val media = Media(hold)
        val job = prefetch(source, media)

        job.start()
        runCurrent()
        assertThat(media.inFlight).isEqualTo(8)
        hold.complete(Unit)
        advanceUntilIdle()

        assertThat(media.images).hasSize(20)
        assertThat(media.videos).hasSize(6)
        assertThat(media.maxInFlight).isEqualTo(8)
        assertThat(source.saves).isEqualTo(1)
    }

    @Test
    fun `une video n est jamais prechargee quand la politique la refuse mais les images partent`() = runTest {
        val source = Source(groups = listOf(group(0, listOf(listOf(media("i"), media("v", FeedMediaType.VIDEO))))))
        val media = Media()
        val gate = StoryPrefetchGate { it != MediaKind.VIDEO }

        prefetch(source, media, gate).start()
        advanceUntilIdle()

        assertThat(media.images).containsExactly("u://i")
        assertThat(media.videos).isEmpty()
    }

    @Test
    fun `sur reseau facture la politique par defaut interdit la video, hors ligne tout`() {
        fun gate(condition: NetworkCondition) = StoryPrefetchGate { kind ->
            MediaAutoDownloadDecider.decide(kind, MediaAvailability.NEEDS_DOWNLOAD, condition, MediaDownloadPreferences()).shouldDownload
        }

        assertThat(gate(NetworkCondition.GOOD_CELLULAR).allows(MediaKind.VIDEO)).isFalse()
        assertThat(gate(NetworkCondition.WIFI).allows(MediaKind.VIDEO)).isTrue()
        assertThat(gate(NetworkCondition.OFFLINE).allows(MediaKind.IMAGE)).isFalse()
    }

    @Test
    fun `un plateau deja en cache n est ni refetche ni precharge`() = runTest {
        val source = Source(cached = true, groups = listOf(group(0, listOf(listOf(media("i"))))))
        val media = Media()

        prefetch(source, media).start()
        advanceUntilIdle()

        assertThat(source.fetches).isEqualTo(0)
        assertThat(media.images).isEmpty()
    }

    @Test
    fun `le plateau n est sauvegarde que s il est encore vide a la fin`() = runTest {
        val source = Source(groups = listOf(group(0, listOf(listOf(media("i"))))))
        val racing = object : StoryMediaPrefetcher {
            override suspend fun image(url: String) { source.cached = true }
            override suspend fun video(url: String) = Unit
        }

        ConversationStoryPrefetch(source, racing, { StoryPrefetchGate.Open }, StandardTestDispatcher(testScheduler)).start()
        advanceUntilIdle()

        assertThat(source.saves).isEqualTo(0)
    }

    @Test
    fun `une nouvelle passe annule celle qui court`() = runTest {
        val hold = CompletableDeferred<Unit>()
        val source = Source(groups = listOf(group(0, listOf((0 until 20).map { media("i$it") }))))
        val media = Media(hold)
        val prefetch = prefetch(source, media)

        prefetch.start()
        runCurrent()
        prefetch.cancel()
        hold.complete(Unit)
        advanceUntilIdle()

        assertThat(media.images).hasSize(8)
        assertThat(source.saves).isEqualTo(0)
    }

    @Test
    fun `un echec reseau ne leve rien`() = runTest {
        val source = Source(groups = null)

        prefetch(source, Media()).start()
        advanceUntilIdle()

        assertThat(source.saves).isEqualTo(0)
    }
}
