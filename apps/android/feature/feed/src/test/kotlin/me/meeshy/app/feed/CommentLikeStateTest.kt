package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPostComment
import org.junit.Test

/**
 * The optimistic like SSOT for a post's comment thread. Owns the set of liked comment ids,
 * an optimistic per-comment count delta, and an in-flight guard so a double-tap can't fire two
 * network calls. Every transition is pure — the ViewModel owns "when to call the API", this owns
 * "what the like state becomes". Mirrors iOS `PostDetailViewModel.toggleCommentLike` semantics.
 */
class CommentLikeStateTest {

    private val heart = "❤️"

    private fun comment(id: String, reactions: List<String>? = null) =
        ApiPostComment(id = id, currentUserReactions = reactions)

    @Test
    fun `fresh state has nothing liked and a zero delta`() {
        val s = CommentLikeState()
        assertThat(s.isLiked("c1")).isFalse()
        assertThat(s.isInFlight("c1")).isFalse()
        assertThat(s.displayCount("c1", baseCount = 4)).isEqualTo(4)
    }

    @Test
    fun `seed marks a comment liked when the server reaction includes the heart`() {
        val s = CommentLikeState().seeded(
            listOf(comment("a", reactions = listOf(heart)), comment("b", reactions = listOf("🔥"))),
            heart,
        )
        assertThat(s.isLiked("a")).isTrue()
        assertThat(s.isLiked("b")).isFalse()
    }

    @Test
    fun `seed leaves the count delta untouched`() {
        val s = CommentLikeState().seeded(listOf(comment("a", reactions = listOf(heart))), heart)
        assertThat(s.displayCount("a", baseCount = 3)).isEqualTo(3)
    }

    @Test
    fun `seed is additive across pages and does not drop earlier likes`() {
        val first = CommentLikeState().seeded(listOf(comment("a", reactions = listOf(heart))), heart)
        val second = first.seeded(listOf(comment("b", reactions = listOf(heart))), heart)
        assertThat(second.isLiked("a")).isTrue()
        assertThat(second.isLiked("b")).isTrue()
    }

    @Test
    fun `seed never overrides a locally toggled comment`() {
        val locallyUnliked = CommentLikeState()
            .seeded(listOf(comment("a", reactions = listOf(heart))), heart)
            .beginToggle("a")!!
            .settle("a")
        assertThat(locallyUnliked.isLiked("a")).isFalse()
        val reSeeded = locallyUnliked.seeded(listOf(comment("a", reactions = listOf(heart))), heart)
        assertThat(reSeeded.isLiked("a")).isFalse()
    }

    @Test
    fun `begin toggle likes an unliked comment optimistically`() {
        val s = CommentLikeState().beginToggle("a")!!
        assertThat(s.isLiked("a")).isTrue()
        assertThat(s.isInFlight("a")).isTrue()
        assertThat(s.displayCount("a", baseCount = 2)).isEqualTo(3)
    }

    @Test
    fun `begin toggle unlikes a liked comment optimistically`() {
        val liked = CommentLikeState().seeded(listOf(comment("a", reactions = listOf(heart))), heart)
        val s = liked.beginToggle("a")!!
        assertThat(s.isLiked("a")).isFalse()
        assertThat(s.displayCount("a", baseCount = 5)).isEqualTo(4)
    }

    @Test
    fun `begin toggle is guarded while a toggle is already in flight`() {
        val s = CommentLikeState().beginToggle("a")!!
        assertThat(s.beginToggle("a")).isNull()
    }

    @Test
    fun `settle keeps the optimistic result and clears the in-flight mark`() {
        val s = CommentLikeState().beginToggle("a")!!.settle("a")
        assertThat(s.isLiked("a")).isTrue()
        assertThat(s.isInFlight("a")).isFalse()
        assertThat(s.displayCount("a", baseCount = 0)).isEqualTo(1)
    }

    @Test
    fun `settle is inert when nothing is in flight for the comment`() {
        val s = CommentLikeState()
        assertThat(s.settle("a")).isEqualTo(s)
    }

    @Test
    fun `rollback reverts the optimistic like and clears the in-flight mark`() {
        val s = CommentLikeState().beginToggle("a")!!.rollback("a")
        assertThat(s.isLiked("a")).isFalse()
        assertThat(s.isInFlight("a")).isFalse()
        assertThat(s.displayCount("a", baseCount = 7)).isEqualTo(7)
    }

    @Test
    fun `rollback reverts the optimistic unlike back to liked`() {
        val liked = CommentLikeState().seeded(listOf(comment("a", reactions = listOf(heart))), heart)
        val s = liked.beginToggle("a")!!.rollback("a")
        assertThat(s.isLiked("a")).isTrue()
        assertThat(s.displayCount("a", baseCount = 5)).isEqualTo(5)
    }

    @Test
    fun `rollback is inert when nothing is in flight for the comment`() {
        val s = CommentLikeState()
        assertThat(s.rollback("a")).isEqualTo(s)
    }

    @Test
    fun `after a settled toggle the comment can be toggled again`() {
        val s = CommentLikeState().beginToggle("a")!!.settle("a").beginToggle("a")!!
        assertThat(s.isLiked("a")).isFalse()
        // liked (+1) then unliked (-1) nets zero → the count reverts to the server base.
        assertThat(s.displayCount("a", baseCount = 1)).isEqualTo(1)
    }

    @Test
    fun `display count never goes below zero`() {
        val s = CommentLikeState().beginToggle("a")!!
        assertThat(s.displayCount("a", baseCount = 0)).isEqualTo(1)
        val unliked = CommentLikeState().seeded(listOf(comment("a", reactions = listOf(heart))), heart)
            .beginToggle("a")!!
        assertThat(unliked.displayCount("a", baseCount = 0)).isEqualTo(0)
    }
}
