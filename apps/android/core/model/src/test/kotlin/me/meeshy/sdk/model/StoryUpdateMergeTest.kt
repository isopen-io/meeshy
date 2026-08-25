package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryUpdateMergeTest {

    private fun story(
        id: String = "s1",
        authorId: String = "author",
        content: String? = "Bonjour",
        reactionSummary: Map<String, Int>? = null,
        isViewedByMe: Boolean? = false,
        currentUserReactions: List<String>? = null,
    ) = ApiPost(
        id = id,
        type = "STORY",
        content = content,
        author = ApiAuthor(id = authorId, username = "alice"),
        reactionSummary = reactionSummary,
        isViewedByMe = isViewedByMe,
        currentUserReactions = currentUserReactions,
    )

    @Test
    fun `a non-owner content edit reverts the ring to unseen on an engagement reset`() {
        val previous = story(isViewedByMe = true)
        // The edit wiped views/reactions server-side; the broadcast reports the story unseen.
        val updated = story(content = "Bonjour (edited)", isViewedByMe = false)

        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset = true, isOwnStory = false)

        assertThat(merged).isNotNull()
        assertThat(merged!!.isViewedByMe).isFalse()
        assertThat(merged.content).isEqualTo("Bonjour (edited)")
    }

    @Test
    fun `the author keeps their own seen state even on an engagement reset`() {
        val previous = story(isViewedByMe = true)
        val updated = story(content = "Bonjour (edited)", isViewedByMe = false)

        // The server never records the author's own view of their own story, so the
        // author's client-only "seen" survives even a content edit that reset engagement.
        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset = true, isOwnStory = true)

        assertThat(merged).isNotNull()
        assertThat(merged!!.isViewedByMe).isTrue()
        assertThat(merged.content).isEqualTo("Bonjour (edited)")
    }

    @Test
    fun `a metadata-only edit keeps the reader's monotone seen state`() {
        val previous = story(isViewedByMe = true)
        // A visibility change carries no engagement reset; the unpersonalized broadcast
        // still reports the story unseen — monotonicity must keep it seen.
        val updated = story(content = "Bonjour (edited)", isViewedByMe = false)

        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset = false, isOwnStory = false)

        assertThat(merged).isNotNull()
        assertThat(merged!!.isViewedByMe).isTrue()
        assertThat(merged.content).isEqualTo("Bonjour (edited)")
    }

    @Test
    fun `a metadata-only edit adopts the authoritative reaction summary`() {
        val previous = story(reactionSummary = mapOf("heart" to 1), isViewedByMe = true)
        val updated = story(reactionSummary = mapOf("heart" to 9), isViewedByMe = false)

        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset = false, isOwnStory = false)

        assertThat(merged).isNotNull()
        assertThat(merged!!.reactionSummary).containsExactly("heart", 9)
        assertThat(merged.isViewedByMe).isTrue()
    }

    @Test
    fun `is inert for an identical re-broadcast on the reset path`() {
        val previous = story(isViewedByMe = false)
        val updated = story(isViewedByMe = false)

        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset = true, isOwnStory = false)

        assertThat(merged).isNull()
    }

    @Test
    fun `is inert when a metadata edit changes nothing the reader can see`() {
        val previous = story(isViewedByMe = true)
        // Same authoritative content; the broadcast's own seen flag is ignored anyway.
        val updated = story(isViewedByMe = false)

        val merged = StoryUpdateMerge.merge(previous, updated, engagementReset = false, isOwnStory = false)

        assertThat(merged).isNull()
    }
}
