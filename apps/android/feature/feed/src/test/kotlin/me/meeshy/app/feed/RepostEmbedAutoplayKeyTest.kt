package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FeedReelFrame
import me.meeshy.sdk.model.FeedReelKind
import org.junit.Test

/** L'élection d'un réel republié se fait sur l'id du post CONTENANT : un réel natif et son repost n'élisent qu'une surface. */
@OptIn(ExperimentalCoroutinesApi::class)
class RepostEmbedAutoplayKeyTest {

    @Test
    fun `la cle d election est l id du post contenant et jamais celui du reel cite`() {
        assertThat(RepostEmbedAutoplayKey.of("outer-1")).isEqualTo("outer-1")
    }

    @Test
    fun `le coordinateur elit le post contenant au centre du viewport`() = runTest {
        val coordinator = FeedAutoplayCoordinator(scope = backgroundScope)
        val contentId = RepostEmbedAutoplayKey.of("outer-1")
        coordinator.update(
            frames = listOf(FeedReelFrame(id = contentId, midY = 500f, height = 160f, kind = FeedReelKind.VIDEO)),
            viewportMin = 0f,
            viewportMax = 1000f,
        )
        advanceTimeBy(FeedAutoplayCoordinator.ELECTION_DEBOUNCE_MS + 1)
        runCurrent()
        assertThat(coordinator.activeId.value).isEqualTo("outer-1")
        assertThat(coordinator.isLive("outer-1")).isTrue()
        assertThat(coordinator.isLive("reel-cite")).isFalse()
    }
}
