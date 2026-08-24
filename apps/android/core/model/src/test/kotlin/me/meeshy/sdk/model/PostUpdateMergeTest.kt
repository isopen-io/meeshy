package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostUpdateMergeTest {

    private fun post(
        id: String = "p1",
        content: String? = "Bonjour",
        likeCount: Int? = 2,
        commentCount: Int? = 0,
        reactionSummary: Map<String, Int>? = null,
        isEdited: Boolean? = false,
        isLikedByMe: Boolean? = false,
        isBookmarkedByMe: Boolean? = false,
        isViewedByMe: Boolean? = false,
        currentUserReactions: List<String>? = null,
    ) = ApiPost(
        id = id,
        content = content,
        likeCount = likeCount,
        commentCount = commentCount,
        reactionSummary = reactionSummary,
        isEdited = isEdited,
        isLikedByMe = isLikedByMe,
        isBookmarkedByMe = isBookmarkedByMe,
        isViewedByMe = isViewedByMe,
        currentUserReactions = currentUserReactions,
    )

    @Test
    fun `adopts the edited content and authoritative counts`() {
        val previous = post(content = "Bonjour", likeCount = 2, commentCount = 1)
        val updated = post(content = "Bonjour (edited)", likeCount = 9, commentCount = 4, isEdited = true)

        val merged = PostUpdateMerge.merge(previous, updated)

        assertThat(merged).isNotNull()
        assertThat(merged!!.content).isEqualTo("Bonjour (edited)")
        assertThat(merged.likeCount).isEqualTo(9)
        assertThat(merged.commentCount).isEqualTo(4)
        assertThat(merged.isEdited).isTrue()
    }

    @Test
    fun `preserves the reader's own like state against an unpersonalized broadcast`() {
        val previous = post(isLikedByMe = true)
        // The broadcast carries the author's/default view — isLikedByMe false.
        val updated = post(content = "edited", isLikedByMe = false)

        val merged = PostUpdateMerge.merge(previous, updated)

        assertThat(merged!!.isLikedByMe).isTrue()
    }

    @Test
    fun `preserves bookmark, viewed and reaction state across the swap`() {
        val previous = post(
            isBookmarkedByMe = true,
            isViewedByMe = true,
            currentUserReactions = listOf("heart", "fire"),
        )
        val updated = post(
            content = "edited",
            isBookmarkedByMe = false,
            isViewedByMe = false,
            currentUserReactions = null,
        )

        val merged = PostUpdateMerge.merge(previous, updated)

        assertThat(merged!!.isBookmarkedByMe).isTrue()
        assertThat(merged.isViewedByMe).isTrue()
        assertThat(merged.currentUserReactions).containsExactly("heart", "fire").inOrder()
    }

    @Test
    fun `is inert when the edit changes nothing the reader can see`() {
        val previous = post(isLikedByMe = true)
        // Same content and counts; the broadcast's own like flag is ignored anyway.
        val updated = post(isLikedByMe = false)

        val merged = PostUpdateMerge.merge(previous, updated)

        assertThat(merged).isNull()
    }

    @Test
    fun `is inert for an identical re-broadcast`() {
        val previous = post(content = "same", likeCount = 3, isLikedByMe = true)
        val updated = post(content = "same", likeCount = 3, isLikedByMe = true)

        assertThat(PostUpdateMerge.merge(previous, updated)).isNull()
    }

    @Test
    fun `an authoritative reaction summary change alone is not a no-op`() {
        val previous = post(reactionSummary = mapOf("heart" to 1), isLikedByMe = true)
        val updated = post(reactionSummary = mapOf("heart" to 5), isLikedByMe = false)

        val merged = PostUpdateMerge.merge(previous, updated)

        assertThat(merged).isNotNull()
        assertThat(merged!!.reactionSummary).containsExactly("heart", 5)
        assertThat(merged.isLikedByMe).isTrue()
    }
}
