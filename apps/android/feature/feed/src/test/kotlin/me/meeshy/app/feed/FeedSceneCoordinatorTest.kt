package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13663 — le coordinateur tient l'élection du fil ; les cartes ne lisent que « suis-je la scène active ? ». */
class FeedSceneCoordinatorTest {

    private fun frame(id: String, from: Float) = FeedSceneFrame(id, from, from + 500f)

    @Test
    fun `une seule scene est active a la fois`() {
        val coordinator = FeedSceneCoordinator()
        coordinator.update(listOf(frame("a", 100f), frame("b", 550f)), 0f, 1600f)
        assertThat(listOf("a", "b").filter(coordinator::isLive)).containsExactly("b")
    }

    @Test
    fun `quitter l ecran ou vider le fil coupe toute scene`() {
        val coordinator = FeedSceneCoordinator()
        coordinator.update(listOf(frame("a", 500f)), 0f, 1600f)
        assertThat(coordinator.isLive("a")).isTrue()
        coordinator.clear()
        assertThat(coordinator.isLive("a")).isFalse()
    }

    @Test
    fun `l election precedente sert d hysteresis`() {
        val coordinator = FeedSceneCoordinator()
        coordinator.update(listOf(frame("a", 300f), frame("b", 900f)), 0f, 1600f)
        coordinator.update(listOf(frame("a", 290f), frame("b", 640f)), 0f, 1600f)
        assertThat(coordinator.activeId).isEqualTo("a")
    }
}
