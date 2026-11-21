package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #18931 — a live gesture on a post, as every cached copy takes it: the gateway's absolute counts. */
class PostEngagementPatchTest {

    private val post = ApiPost(id = "p1", likeCount = 3, commentCount = 2, isLikedByMe = false)

    @Test
    fun `a like takes the served count, and lights the heart only for my own gesture`() {
        assertThat(PostEngagementPatch.liked(post, likeCount = 4, mine = null))
            .isEqualTo(post.copy(likeCount = 4))
        assertThat(PostEngagementPatch.liked(post, likeCount = 4, mine = true))
            .isEqualTo(post.copy(likeCount = 4, isLikedByMe = true))
    }

    @Test
    fun `an unlike of mine turns the heart off with the served count`() {
        val liked = post.copy(isLikedByMe = true, likeCount = 4)

        assertThat(PostEngagementPatch.liked(liked, likeCount = 3, mine = false))
            .isEqualTo(liked.copy(likeCount = 3, isLikedByMe = false))
    }

    @Test
    fun `a like already applied changes nothing`() {
        assertThat(PostEngagementPatch.liked(post, likeCount = 3, mine = null)).isNull()
    }

    @Test
    fun `a comment takes the served comment count`() {
        assertThat(PostEngagementPatch.commented(post, commentCount = 5)).isEqualTo(post.copy(commentCount = 5))
    }

    @Test
    fun `a comment count already applied changes nothing, and a served count never goes below zero`() {
        assertThat(PostEngagementPatch.commented(post, commentCount = 2)).isNull()
        assertThat(PostEngagementPatch.commented(post, commentCount = -1)).isEqualTo(post.copy(commentCount = 0))
    }

    @Test
    fun `a bookmark takes the served state and the served count`() {
        assertThat(PostEngagementPatch.bookmarked(post, bookmarked = true, bookmarkCount = 4))
            .isEqualTo(post.copy(isBookmarkedByMe = true, bookmarkCount = 4))
    }

    @Test
    fun `a bookmark already applied changes nothing, and a served count never goes below zero`() {
        val saved = post.copy(isBookmarkedByMe = true, bookmarkCount = 4)

        assertThat(PostEngagementPatch.bookmarked(saved, bookmarked = true, bookmarkCount = 4)).isNull()
        assertThat(PostEngagementPatch.bookmarked(saved, bookmarked = false, bookmarkCount = -1))
            .isEqualTo(saved.copy(isBookmarkedByMe = false, bookmarkCount = 0))
    }
}
