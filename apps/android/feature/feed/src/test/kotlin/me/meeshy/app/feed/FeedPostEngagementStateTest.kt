package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

class FeedPostEngagementStateTest {

    private fun post(
        id: String = "p1",
        likes: Int = 3,
        liked: Boolean? = null,
        bookmarked: Boolean? = null,
        reposted: Boolean? = null,
        shares: Int? = null,
    ) = ApiPost(
        id = id,
        likeCount = likes,
        isLikedByMe = liked,
        isBookmarkedByMe = bookmarked,
        isRepostedByMe = reposted,
        shareCount = shares,
    )

    private val empty = FeedPostEngagementState()

    @Test
    fun `seeding marks the posts the server says the reader liked, bookmarked or reposted`() {
        val state = empty.seededFrom(listOf(post("a", liked = true), post("b", bookmarked = true), post("c", reposted = true), post("d")))

        assertThat(state.likedIds).containsExactly("a")
        assertThat(state.bookmarkedIds).containsExactly("b")
        assertThat(state.repostedIds).containsExactly("c")
    }

    @Test
    fun `seeding never overrides a heart the reader just toggled`() {
        val toggled = empty.heartToggled("a")
        val seeded = toggled.seededFrom(listOf(post("a", liked = false)))

        assertThat(seeded.likedIds).contains("a")
    }

    @Test
    fun `a toggled heart moves the shown count by one and a second toggle brings it back`() {
        val liked = empty.heartToggled("p1")
        assertThat(liked.snapshot(post(likes = 3)).displayLikeCount).isEqualTo(4)
        assertThat(liked.snapshot(post(likes = 3)).isLiked).isTrue()
        assertThat(liked.snapshot(post(likes = 3)).isHeartInFlight).isTrue()

        val unliked = liked.heartToggled("p1")
        assertThat(unliked.snapshot(post(likes = 3)).displayLikeCount).isEqualTo(3)
        assertThat(unliked.snapshot(post(likes = 3)).isLiked).isFalse()
    }

    @Test
    fun `the shown count never goes below zero`() {
        val unliked = empty.seededFrom(listOf(post(likes = 0, liked = true))).heartToggled("p1")

        assertThat(unliked.snapshot(post(likes = 0)).displayLikeCount).isEqualTo(0)
    }

    @Test
    fun `a refused heart rolls the id and the count back`() {
        val rolledBack = empty.heartToggled("p1").heartRolledBack("p1", wasLiked = false)
        val shown = rolledBack.snapshot(post(likes = 3))

        assertThat(shown.isLiked).isFalse()
        assertThat(shown.displayLikeCount).isEqualTo(3)
        assertThat(shown.isHeartInFlight).isFalse()
    }

    @Test
    fun `a refused unlike gives the heart and the count back`() {
        val state = empty.seededFrom(listOf(post(liked = true))).heartToggled("p1").heartRolledBack("p1", wasLiked = true)
        val shown = state.snapshot(post(likes = 3))

        assertThat(shown.isLiked).isTrue()
        assertThat(shown.displayLikeCount).isEqualTo(3)
    }

    @Test
    fun `post liked purges the delta and lights the heart only for the reader`() {
        val mine = empty.heartToggled("p1").postLiked("p1", userId = "me", currentUserId = "me")
        assertThat(mine.likeDelta).doesNotContainKey("p1")
        assertThat(mine.likedIds).contains("p1")

        val theirs = empty.postLiked("p1", userId = "other", currentUserId = "me")
        assertThat(theirs.likedIds).doesNotContain("p1")
    }

    @Test
    fun `post unliked from the reader turns the heart off`() {
        val state = empty.seededFrom(listOf(post(liked = true))).postUnliked("p1", userId = "me", currentUserId = "me")

        assertThat(state.likedIds).doesNotContain("p1")
    }

    @Test
    fun `a heart reaction from another user moves the count and one from the reader lights the heart`() {
        val other = empty.reactionAdded(FeedPostEngagementState.HEART_EMOJI, "other", "p1", "me")
        assertThat(other.snapshot(post(likes = 3)).displayLikeCount).isEqualTo(4)
        assertThat(other.likedIds).isEmpty()

        val mine = empty.reactionAdded(FeedPostEngagementState.HEART_EMOJI, "me", "p1", "me")
        assertThat(mine.likedIds).containsExactly("p1")

        val removed = other.reactionRemoved(FeedPostEngagementState.HEART_EMOJI, "other", "p1", "me")
        assertThat(removed.snapshot(post(likes = 3)).displayLikeCount).isEqualTo(3)
    }

    @Test
    fun `a reaction other than the heart changes nothing`() {
        assertThat(empty.reactionAdded("🔥", "other", "p1", "me")).isSameInstanceAs(empty)
    }

    @Test
    fun `post bookmarked keeps the delta when the gateway sent no absolute count`() {
        val toggled = empty.bookmarkToggled("p1")

        assertThat(toggled.postBookmarked("p1", bookmarked = true, hasAbsoluteCount = false).bookmarkDelta).containsKey("p1")
        assertThat(toggled.postBookmarked("p1", bookmarked = true, hasAbsoluteCount = true).bookmarkDelta).doesNotContainKey("p1")
    }

    @Test
    fun `a refused bookmark rolls back and the count stays non negative`() {
        val state = empty.bookmarkToggled("p1").bookmarkRolledBack("p1", wasBookmarked = false)
        val shown = state.snapshot(post())

        assertThat(shown.isBookmarked).isFalse()
        assertThat(shown.displayBookmarkCount).isEqualTo(0)
        assertThat(shown.isBookmarkInFlight).isFalse()
    }

    @Test
    fun `reconciling a reloaded list drops a heart the server no longer has but keeps a heart in flight`() {
        val state = empty.seededFrom(listOf(post("a", liked = true), post("b", liked = true))).heartToggled("b").heartToggled("b")
        val reconciled = state.reconciledWith(listOf(post("a", liked = false), post("b", liked = false)))

        assertThat(reconciled.likedIds).containsExactly("b")
    }

    @Test
    fun `reconciling a reloaded list adds the bookmarks and reposts it now serves`() {
        val reconciled = empty.reconciledWith(listOf(post("a", bookmarked = true, reposted = true)))

        assertThat(reconciled.bookmarkedIds).containsExactly("a")
        assertThat(reconciled.repostedIds).containsExactly("a")
    }

    @Test
    fun `the share count follows its delta and a null served count reads as zero`() {
        val state = empty.copy(shareDelta = mapOf("p1" to 2))

        assertThat(state.snapshot(post(shares = 5)).displayShareCount).isEqualTo(7)
        assertThat(state.snapshot(post(shares = null)).displayShareCount).isEqualTo(2)
    }

    @Test
    fun `no method mutates the state it is called on`() {
        val before = empty.heartToggled("p1")
        before.heartRolledBack("p1", wasLiked = false)
        before.postLiked("p1", "me", "me")

        assertThat(before.likedIds).containsExactly("p1")
        assertThat(before.likeDelta).containsExactly("p1", 1)
    }
}
