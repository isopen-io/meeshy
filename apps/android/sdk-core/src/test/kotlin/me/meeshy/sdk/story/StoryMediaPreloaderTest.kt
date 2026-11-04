package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.InMemoryMediaDownloadPreferencesStore
import me.meeshy.sdk.media.InMemoryNetworkConditionMonitor
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.story.StoryPreloadMedia
import me.meeshy.sdk.model.story.StoryPreloadStory
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryMediaPreloaderTest {
    private class Recorder : StoryMediaFetcher {
        val fetched = mutableListOf<Pair<String, FeedMediaType>>()
        override suspend fun fetch(url: String, kind: FeedMediaType) {
            fetched += url to kind
        }
    }

    private fun story(url: String, type: FeedMediaType? = null, viewed: Boolean = false) =
        StoryPreloadStory(viewed, listOf(StoryPreloadMedia(url, type)))

    private fun TestScope.preloader(
        recorder: Recorder,
        monitor: InMemoryNetworkConditionMonitor = InMemoryNetworkConditionMonitor(NetworkCondition.WIFI),
    ) = StoryMediaPreloader(monitor, InMemoryMediaDownloadPreferencesStore(), recorder, backgroundScope)

    @Test
    fun `huit groupes au plus sont prechargés puis les slides suivantes`() = runTest {
        val recorder = Recorder()
        val groups = (0 until 10).map { g -> listOf(story("https://c/f$g.jpg"), story("https://c/n$g.jpg")) }
        preloader(recorder).preload(groups)
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        val urls = recorder.fetched.map { it.first }
        assertThat(urls.filter { it.contains("/f") }).hasSize(8)
        assertThat(urls.filter { it.contains("/n") }).hasSize(8)
        assertThat(urls).doesNotContain("https://c/f8.jpg")
    }

    @Test
    fun `un mp4 declare image est tire comme video`() = runTest {
        val recorder = Recorder()
        preloader(recorder).preload(listOf(listOf(story("https://c/v.mp4", FeedMediaType.IMAGE))))
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        assertThat(recorder.fetched).containsExactly("https://c/v.mp4" to FeedMediaType.VIDEO)
    }

    @Test
    fun `une video n'est pas prechargee en cellulaire et n'est pas marquee prechargee`() = runTest {
        val recorder = Recorder()
        val monitor = InMemoryNetworkConditionMonitor(NetworkCondition.GOOD_CELLULAR)
        val loader = preloader(recorder, monitor)
        loader.preload(listOf(listOf(story("https://c/v.mp4"), story("https://c/i.jpg"))))
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        assertThat(recorder.fetched.map { it.first }).doesNotContain("https://c/v.mp4")
        assertThat(loader.claimedUrls()).doesNotContain("https://c/v.mp4")
    }

    @Test
    fun `le retour du wifi rattrape la video sautee`() = runTest {
        val recorder = Recorder()
        val monitor = InMemoryNetworkConditionMonitor(NetworkCondition.GOOD_CELLULAR)
        val loader = preloader(recorder, monitor)
        loader.preload(listOf(listOf(story("https://c/v.mp4"))))
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        monitor.set(NetworkCondition.WIFI)
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        assertThat(recorder.fetched.map { it.first }).containsExactly("https://c/v.mp4")
    }

    @Test
    fun `un second appel ne retire pas deux fois la meme url`() = runTest {
        val recorder = Recorder()
        val loader = preloader(recorder)
        val groups = listOf(listOf(story("https://c/a.jpg")))
        loader.preload(groups)
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        loader.preload(groups)
        testScheduler.advanceTimeBy(10_000); testScheduler.runCurrent()
        assertThat(recorder.fetched).hasSize(1)
    }
}
