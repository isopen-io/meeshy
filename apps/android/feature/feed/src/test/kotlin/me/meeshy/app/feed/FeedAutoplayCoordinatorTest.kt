package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FeedReelAutoplay
import me.meeshy.sdk.model.FeedReelFrame
import me.meeshy.sdk.model.FeedReelKind
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FeedAutoplayCoordinatorTest {

    private fun frame(id: String, midY: Float, kind: FeedReelKind = FeedReelKind.VIDEO) = FeedReelFrame(id, midY, 400f, kind)

    private val frames = listOf(frame("a", 300f), frame("b", 780f), frame("c", 1300f, FeedReelKind.SCENE))

    /** L'élection vit dans `backgroundScope`, qu'`advanceUntilIdle` ne fait pas avancer : on laisse passer le débounce. */
    private fun TestScope.settle() = advanceTimeBy(FeedAutoplayCoordinator.ELECTION_DEBOUNCE_MS * 2)

    private fun TestScope.coordinator(call: MutableStateFlow<Boolean> = MutableStateFlow(false), prewarm: Boolean = true) =
        FeedAutoplayCoordinator(scope = backgroundScope, callActive = call, prewarmsNeighbours = { prewarm })

    @Test
    fun `l election attend le calme du defilement puis elit le plus centre`() = runTest {
        val coordinator = coordinator()
        coordinator.update(frames, 0f, 1600f)
        advanceTimeBy(50)
        assertThat(coordinator.activeId.value).isNull()
        settle()
        assertThat(coordinator.activeId.value).isEqualTo("b")
        assertThat(coordinator.prewarmId.value).isEqualTo("c")
    }

    @Test
    fun `un nouveau mouvement annule l election en attente`() = runTest {
        val coordinator = coordinator()
        coordinator.update(frames, 0f, 1600f)
        advanceTimeBy(60)
        coordinator.update(listOf(frame("a", 800f)), 0f, 1600f)
        settle()
        assertThat(coordinator.activeId.value).isEqualTo("a")
    }

    @Test
    fun `un appel qui s ouvre sans defilement coupe l election et la prewarm`() = runTest {
        val call = MutableStateFlow(false)
        val coordinator = coordinator(call)
        coordinator.update(frames, 0f, 1600f)
        settle()
        call.value = true
        settle()
        assertThat(coordinator.activeId.value).isNull()
        assertThat(coordinator.prewarmId.value).isNull()
        coordinator.update(frames, 0f, 1600f)
        settle()
        assertThat(coordinator.activeId.value).isNull()
    }

    @Test
    fun `la fin de l appel rend la lecture a la surface la plus centree`() = runTest {
        val call = MutableStateFlow(false)
        val coordinator = coordinator(call)
        frames.forEach(coordinator::report)
        coordinator.reportViewport(0f, 1600f)
        coordinator.electReported()
        settle()
        call.value = true
        settle()
        call.value = false
        settle()
        assertThat(coordinator.activeId.value).isEqualTo("b")
    }

    @Test
    fun `une surface qui perd l election n est plus vivante`() = runTest {
        val coordinator = coordinator()
        coordinator.update(frames, 0f, 1600f)
        settle()
        assertThat(coordinator.isLive("b")).isTrue()
        coordinator.update(listOf(frame("a", 780f), frame("b", 5000f)), 0f, 1600f)
        settle()
        assertThat(coordinator.isLive("b")).isFalse()
        assertThat(coordinator.isLive("a")).isTrue()
    }

    @Test
    fun `quitter l ecran coupe tout et la garde libere le moteur de la carte qui le possede`() = runTest {
        val coordinator = coordinator()
        coordinator.update(frames, 0f, 1600f)
        settle()
        coordinator.clear()
        assertThat(coordinator.activeId.value).isNull()
        assertThat(FeedReelAutoplay.shouldRelinquish(ownsEngine = true, isShowingThis = !coordinator.isLive("b"))).isTrue()
    }

    @Test
    fun `sans prewarm voisin autorise personne n est prechauffe`() = runTest {
        val coordinator = coordinator(prewarm = false)
        coordinator.update(frames, 0f, 1600f)
        settle()
        assertThat(coordinator.prewarmId.value).isNull()
    }

    @Test
    fun `un cadre oublie ne concourt plus`() = runTest {
        val coordinator = coordinator()
        frames.forEach(coordinator::report)
        coordinator.forget("b")
        assertThat(coordinator.reportedFrames().map { it.id }).containsExactly("a", "c")
    }
}
