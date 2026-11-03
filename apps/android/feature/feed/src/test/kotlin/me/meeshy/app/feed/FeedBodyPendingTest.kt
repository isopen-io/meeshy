package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #14902 — la publication que l'auteur vient d'écrire se lit dans le fil même quand le fil n'a encore rien d'autre. */
class FeedBodyPendingTest {

    @Test
    fun `a pending publication alone draws the post list, never the empty or error state`() {
        assertThat(FeedUiState().body(hasPending = true)).isEqualTo(FeedBody.POSTS)
        assertThat(FeedUiState(loadFailed = true).body(hasPending = true)).isEqualTo(FeedBody.POSTS)
        assertThat(FeedUiState(showSkeleton = true).body(hasPending = true)).isEqualTo(FeedBody.POSTS)
    }

    @Test
    fun `without a pending publication the body is the feed's own`() {
        assertThat(FeedUiState().body(hasPending = false)).isEqualTo(FeedBody.EMPTY)
        assertThat(FeedUiState(showSkeleton = true).body(hasPending = false)).isEqualTo(FeedBody.SKELETON)
    }

    @Test
    fun `offline, the band sits over a pending publication too`() {
        assertThat(FeedUiState(isOffline = true).showsOfflineBand(hasPending = true)).isTrue()
        assertThat(FeedUiState(isOffline = true).showsOfflineBand(hasPending = false)).isFalse()
    }
}
