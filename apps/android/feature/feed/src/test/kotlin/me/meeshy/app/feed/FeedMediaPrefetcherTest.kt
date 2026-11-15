package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.InMemoryMediaDownloadPreferencesStore
import me.meeshy.sdk.media.InMemoryNetworkConditionMonitor
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.NetworkCondition
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FeedMediaPrefetcherTest {

    private class RecordingFetcher : FeedMediaFetcher {
        val fetched = mutableListOf<FeedPrefetchTarget>()
        override suspend fun fetch(target: FeedPrefetchTarget) {
            fetched += target
        }
    }

    private fun item(
        id: String,
        type: FeedMediaType,
        thumbnail: String? = null,
    ) = FeedMediaItem(
        id = id, type = type, url = "https://cdn/$id", thumbnailUrl = thumbnail, thumbHash = null,
        thumbnailColor = "4ECDC4", width = null, height = null, durationSeconds = null, fileName = null,
        fileSizeLabel = null, pageCount = null, caption = null, alt = null, transcription = null,
        translatedAudios = emptyList(),
    )

    private fun post(id: String, vararg media: FeedMediaItem) =
        feedPostPresentation(id = id).copy(media = media.toList())

    private val everything = MediaDownloadPreferences(
        image = AutoDownloadPolicy.ALWAYS, video = AutoDownloadPolicy.ALWAYS, audio = AutoDownloadPolicy.ALWAYS,
    )

    private fun TestScope.prefetcher(
        posts: List<FeedPostPresentation>,
        fetcher: FeedMediaFetcher,
        condition: NetworkCondition = NetworkCondition.WIFI,
        prefs: MediaDownloadPreferences = everything,
    ) = FeedMediaPrefetcher(
        posts = { posts },
        network = InMemoryNetworkConditionMonitor(condition),
        preferences = InMemoryMediaDownloadPreferencesStore(prefs),
        fetcher = fetcher,
        scope = this,
    )

    private val allowAll = FeedPrefetchAllowance(image = true, video = true, audio = true)
    private val allowNone = FeedPrefetchAllowance(image = false, video = false, audio = false)

    @Test
    fun `une video avec vignette ne tire qu une image soumise a la politique image`() {
        val video = item("v", FeedMediaType.VIDEO, thumbnail = "https://cdn/v.jpg")

        assertThat(FeedMediaPrefetcher.targetsFor(video, allowAll.copy(video = false)))
            .containsExactly(FeedPrefetchTarget.Image("https://cdn/v.jpg"))
        assertThat(FeedMediaPrefetcher.targetsFor(video, allowAll.copy(image = false))).isEmpty()
    }

    @Test
    fun `une video sans vignette extrait une frame et releve de la politique video`() {
        val video = item("v", FeedMediaType.VIDEO)

        assertThat(FeedMediaPrefetcher.targetsFor(video, allowAll))
            .containsExactly(FeedPrefetchTarget.VideoFrame("https://cdn/v"))
        assertThat(FeedMediaPrefetcher.targetsFor(video, allowAll.copy(video = false))).isEmpty()
    }

    @Test
    fun `une image tire sa vignette puis son original, un document rien`() {
        assertThat(FeedMediaPrefetcher.targetsFor(item("i", FeedMediaType.IMAGE, "https://cdn/i.jpg"), allowAll))
            .containsExactly(FeedPrefetchTarget.Image("https://cdn/i.jpg"), FeedPrefetchTarget.Image("https://cdn/i")).inOrder()
        assertThat(FeedMediaPrefetcher.targetsFor(item("d", FeedMediaType.DOCUMENT), allowAll)).isEmpty()
    }

    @Test
    fun `l audio releve de la politique audio`() {
        val audio = item("a", FeedMediaType.AUDIO)

        assertThat(FeedMediaPrefetcher.targetsFor(audio, allowAll)).containsExactly(FeedPrefetchTarget.Audio("https://cdn/a"))
        assertThat(FeedMediaPrefetcher.targetsFor(audio, allowAll.copy(audio = false))).isEmpty()
    }

    @Test
    fun `hors ligne rien n est precharge`() = runTest(StandardTestDispatcher()) {
        val fetcher = RecordingFetcher()
        val p = prefetcher(listOf(post("p0", item("i", FeedMediaType.IMAGE))), fetcher, condition = NetworkCondition.OFFLINE)

        p.prefetchAround(0)
        advanceUntilIdle()

        assertThat(fetcher.fetched).isEmpty()
    }

    @Test
    fun `une preference jamais interdit ce type meme sur wifi`() = runTest(StandardTestDispatcher()) {
        val fetcher = RecordingFetcher()
        val posts = listOf(post("p0", item("i", FeedMediaType.IMAGE), item("a", FeedMediaType.AUDIO)))
        val p = prefetcher(posts, fetcher, prefs = everything.copy(audio = AutoDownloadPolicy.NEVER))

        p.prefetchAround(0)
        advanceUntilIdle()

        assertThat(fetcher.fetched).containsExactly(FeedPrefetchTarget.Image("https://cdn/i"))
    }

    @Test
    fun `seule la fenetre autour de la rangee est prechargee`() = runTest(StandardTestDispatcher()) {
        val fetcher = RecordingFetcher()
        val posts = (0 until 20).map { post("p$it", item("i$it", FeedMediaType.IMAGE)) }

        prefetcher(posts, fetcher).prefetchAround(10)
        advanceUntilIdle()

        assertThat(fetcher.fetched.map { it.url }.toSet())
            .containsExactlyElementsIn((8..16).map { "https://cdn/i$it" })
    }

    @Test
    fun `le defilement attend l anti-rebond de 150 ms`() = runTest(StandardTestDispatcher()) {
        val fetcher = RecordingFetcher()
        val posts = (0 until 20).map { post("p$it", item("i$it", FeedMediaType.IMAGE)) }
        val p = prefetcher(posts, fetcher)

        p.onRowVisible("p5")
        advanceTimeBy(149)
        assertThat(fetcher.fetched).isEmpty()
        advanceTimeBy(2)
        advanceUntilIdle()

        assertThat(fetcher.fetched).isNotEmpty()
    }

    @Test
    fun `un deplacement de moins de deux rangees ne relance rien`() = runTest(StandardTestDispatcher()) {
        val fetcher = RecordingFetcher()
        val posts = (0 until 20).map { post("p$it", item("i$it", FeedMediaType.IMAGE)) }
        val p = prefetcher(posts, fetcher)

        p.onRowVisible("p5")
        advanceUntilIdle()
        val first = fetcher.fetched.size
        p.onRowVisible("p6")
        advanceUntilIdle()

        assertThat(fetcher.fetched).hasSize(first)
    }

    @Test
    fun `une rangee qui bouge avant la fin de l anti-rebond annule la passe precedente`() = runTest(StandardTestDispatcher()) {
        val fetcher = RecordingFetcher()
        val posts = (0 until 40).map { post("p$it", item("i$it", FeedMediaType.IMAGE)) }
        val p = prefetcher(posts, fetcher)

        p.onRowVisible("p5")
        advanceTimeBy(100)
        p.onRowVisible("p20")
        advanceUntilIdle()

        val urls = fetcher.fetched.map { it.url }
        assertThat(urls).doesNotContain("https://cdn/i5")
        assertThat(urls).contains("https://cdn/i20")
    }

    @Test
    fun `un echec de prechargement n interrompt pas les autres`() = runTest(StandardTestDispatcher()) {
        val fetched = mutableListOf<String>()
        val flaky = object : FeedMediaFetcher {
            override suspend fun fetch(target: FeedPrefetchTarget) {
                if (target.url.endsWith("bad")) error("boom")
                fetched += target.url
            }
        }
        val posts = listOf(post("p0", item("bad", FeedMediaType.IMAGE), item("ok", FeedMediaType.IMAGE)))

        prefetcher(posts, flaky).prefetchAround(0)
        advanceUntilIdle()

        assertThat(fetched).containsExactly("https://cdn/ok")
    }

    @Test
    fun `aucune politique permissive ne tire rien`() {
        assertThat(FeedMediaPrefetcher.targetsFor(item("i", FeedMediaType.IMAGE), allowNone)).isEmpty()
    }
}
