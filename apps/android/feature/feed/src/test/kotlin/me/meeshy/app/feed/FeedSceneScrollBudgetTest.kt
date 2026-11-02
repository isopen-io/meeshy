package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13663 — le gain, mesuré : un défilement de 60 scènes. Avant, chaque carte à l'écran préparait ses 4 lecteurs (fond,
 * média posé, deux pistes) et les recréait à chaque passage ; maintenant seule l'élue en prépare, une fois par élection.
 */
class FeedSceneScrollBudgetTest {

    private val playersPerScene = 4
    private val sceneHeight = 640f
    private val viewport = 1800f
    private val scenes = 60

    private fun frames(scroll: Float) = (0 until scenes).map { i ->
        val from = i * sceneHeight - scroll
        FeedSceneFrame("p$i", from, from + sceneHeight)
    }

    private fun scrollSteps() = generateSequence(0f) { it + 80f }.takeWhile { it < scenes * sceneHeight - viewport }

    @Test
    fun `defiler soixante scenes garde un seul lecteur de scene vivant, quand tout l ecran en preparait trois ou quatre`() {
        val coordinator = FeedSceneCoordinator()
        var previouslyLive: String? = null
        var preparedPlayers = 0
        var electedPeak = 0
        var naivePlayers = 0
        var naivePeak = 0
        var previouslyOnScreen = emptySet<String>()
        scrollSteps().forEachIndexed { step, scroll ->
            val all = frames(scroll)
            val onScreen = all.filter { it.bottom > 0f && it.top < viewport }.map { it.id }.toSet()
            naivePlayers += (onScreen - previouslyOnScreen).size * playersPerScene
            naivePeak = maxOf(naivePeak, onScreen.size * playersPerScene)
            previouslyOnScreen = onScreen
            if (step % 8 != 0) return@forEachIndexed
            coordinator.update(all, 0f, viewport)
            val live = all.filter { coordinator.isLive(it.id) }
            assertThat(live.size).isAtMost(1)
            electedPeak = maxOf(electedPeak, live.size * playersPerScene)
            val liveId = live.singleOrNull()?.id
            if (liveId != null && liveId != previouslyLive) preparedPlayers += playersPerScene
            previouslyLive = liveId
        }
        println("lecteurs de scene sur 60 scenes : crees avant=$naivePlayers apres=$preparedPlayers ; pic simultane avant=$naivePeak apres=$electedPeak")
        assertThat(electedPeak).isEqualTo(playersPerScene)
        assertThat(naivePeak).isAtLeast(3 * playersPerScene)
        assertThat(preparedPlayers).isAtMost(naivePlayers)
    }

    @Test
    fun `immobile, le fil ne prepare rien de plus et hors ecran rien ne joue`() {
        val coordinator = FeedSceneCoordinator()
        repeat(20) { coordinator.update(frames(1280f), 0f, viewport) }
        assertThat(coordinator.activeId).isNotNull()
        coordinator.update(frames(scenes * sceneHeight + 5000f), 0f, viewport)
        assertThat(coordinator.activeId).isNull()
    }
}
