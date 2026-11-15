package me.meeshy.sdk.model.mediahub

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class MediaHubSegmentTest {

    private fun carrier(id: String, minute: Int) =
        ApiMessage(id = id, conversationId = "c", createdAt = "2026-10-01T10:%02d:00.000Z".format(minute))

    @Test
    fun `un cache vide laisse le squelette`() {
        val s = MediaHubSegment().withCache(emptyList(), complete = false)
        assertThat(s.phase).isEqualTo(MediaHubPhase.LOADING)
        assertThat(s.needsNetworkOnOpen).isTrue()
    }

    @Test
    fun `un cache complet se sert sans reseau`() {
        val s = MediaHubSegment().withCache(listOf(carrier("a", 1)), complete = true)
        assertThat(s.phase).isEqualTo(MediaHubPhase.LOADED)
        assertThat(s.needsNetworkOnOpen).isFalse()
        assertThat(s.canLoadMore).isFalse()
    }

    @Test
    fun `un cache perime se peint puis se revalide`() {
        val s = MediaHubSegment().withCache(listOf(carrier("a", 1)), complete = false)
        assertThat(s.phase).isEqualTo(MediaHubPhase.LOADED)
        assertThat(s.needsNetworkOnOpen).isTrue()
    }

    @Test
    fun `la tete sans cache descend par le curseur du serveur puis s arrete`() {
        var s = MediaHubSegment().withCache(emptyList(), false)
        s = s.pageArrived(listOf(carrier("c", 3), carrier("b", 2)), nextCursor = "b", hasMore = true)
        assertThat(s.cursor).isEqualTo(MediaHubCursor.Head("b"))
        assertThat(s.before).isEqualTo("b")
        s = s.startLoadMore()!!.pageArrived(listOf(carrier("a", 1)), nextCursor = null, hasMore = false)
        assertThat(s.cursor).isEqualTo(MediaHubCursor.Done)
        assertThat(s.isComplete).isTrue()
        assertThat(s.carriers.map { it.id }).containsExactly("c", "b", "a").inOrder()
    }

    @Test
    fun `la tete qui rejoint un porteur connu reprend derriere le plus ancien`() {
        var s = MediaHubSegment().withCache(listOf(carrier("b", 2), carrier("a", 1)), complete = false)
        s = s.pageArrived(listOf(carrier("c", 3), carrier("b", 2)), nextCursor = "b", hasMore = true)
        assertThat(s.cursor).isEqualTo(MediaHubCursor.Tail("a"))
    }

    @Test
    fun `une page de plus ne part jamais deux fois`() {
        val s = MediaHubSegment().withCache(listOf(carrier("a", 1)), false).startLoadMore()!!
        assertThat(s.startLoadMore()).isNull()
    }

    @Test
    fun `hors ligne garde ce qui est affiche et echec sans rien le dit`() {
        val withItems = MediaHubSegment().withCache(listOf(carrier("a", 1)), false)
        assertThat(withItems.failed(offline = false).phase).isEqualTo(MediaHubPhase.LOADED)
        assertThat(withItems.failed(offline = true).phase).isEqualTo(MediaHubPhase.OFFLINE)
        assertThat(MediaHubSegment().failed(offline = false).phase).isEqualTo(MediaHubPhase.FAILED)
    }

    @Test
    fun `l echec d une page de suite est signale a part`() {
        val s = MediaHubSegment().withCache(listOf(carrier("a", 1)), false).startLoadMore()!!.failed(offline = false)
        assertThat(s.loadMoreFailed).isTrue()
        assertThat(s.isLoadingMore).isFalse()
    }
}
