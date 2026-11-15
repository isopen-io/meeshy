package me.meeshy.sdk.engagement

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PostEngagementSnapshot
import me.meeshy.sdk.model.PostViewerPoints
import org.junit.Test

class PostViewerPointsStoreTest {

    private fun announce(postId: String, points: Int, at: Long) = PostEngagementSnapshot(postId, points, at)

    @Test
    fun `jamais une valeur plus ancienne que la plus recente connue`() {
        val store = PostViewerPointsStore()
        store.noteAnnouncement(announce("p1", 10, at = 500))
        store.noteAnnouncement(announce("p1", 4, at = 400))
        assertThat(store.displayed("p1", seed = null)).isEqualTo(10)
        store.noteAnnouncement(announce("p1", 3, at = 600))
        assertThat(store.displayed("p1", seed = null)).isEqualTo(3)
    }

    @Test
    fun `une lecture neuve gagne, la meme lecture revue ne defait pas une annonce`() {
        val store = PostViewerPointsStore()
        store.noteRead("p1", 5)
        store.noteAnnouncement(announce("p1", 9, at = 500))
        assertThat(store.displayed("p1", seed = 5)).isEqualTo(9)
        assertThat(store.displayed("p1", seed = 7)).isEqualTo(7)
    }

    @Test
    fun `sans rien de connu la graine sert, sans graine rien`() {
        val store = PostViewerPointsStore()
        assertThat(store.displayed("p1", seed = 2)).isEqualTo(2)
        assertThat(store.displayed("p1", seed = null)).isNull()
    }

    @Test
    fun `le suivi repart de zero au-dela du plafond`() {
        val store = PostViewerPointsStore()
        repeat(PostViewerPoints.MAX_TRACKED_POSTS + 1) { store.noteRead("p$it", 1) }
        assertThat(store.trackedCount).isEqualTo(PostViewerPoints.MAX_TRACKED_POSTS + 1)
        store.noteRead("dernier", 1)
        assertThat(store.trackedCount).isEqualTo(1)
    }

    @Test
    fun `la deconnexion vide tout`() = runTest {
        val store = PostViewerPointsStore()
        store.noteAnnouncement(announce("p1", 10, at = 500))
        store.clear()
        assertThat(store.displayed("p1", seed = null)).isNull()
    }

    @Test
    fun `le flux d'un post ne repete pas et roule a chaque annonce`() = runTest {
        val store = PostViewerPointsStore()
        store.displayedFlow("p1", seed = 5).test {
            assertThat(awaitItem()).isEqualTo(5)
            store.noteAnnouncement(announce("p2", 99, at = 1))
            store.noteRead("p1", 5)
            store.noteAnnouncement(announce("p1", 8, at = 10))
            assertThat(awaitItem()).isEqualTo(8)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
