package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryRealtimeFoldTest {
    private fun post(viewCount: Int? = 2, summary: Map<String, Int>? = null, mine: List<String>? = null) =
        ApiPost(id = "s", type = "STORY", viewCount = viewCount, reactionSummary = summary, currentUserReactions = mine)

    @Test
    fun `viewed adopts the authoritative total`() {
        assertThat(StoryRealtimeFold.viewed(post(viewCount = 2), 7)?.viewCount).isEqualTo(7)
    }

    @Test
    fun `viewed without a total counts one more`() {
        assertThat(StoryRealtimeFold.viewed(post(viewCount = 2), null)?.viewCount).isEqualTo(3)
    }

    @Test
    fun `viewed with the same total is inert`() {
        assertThat(StoryRealtimeFold.viewed(post(viewCount = 7), 7)).isNull()
    }

    @Test
    fun `a stranger's reaction adds one and leaves my own set alone`() {
        val next = StoryRealtimeFold.reactionDelta(post(summary = mapOf("🔥" to 1)), "🔥", actorId = "u1", myId = "me", delta = 1)!!
        assertThat(next.reactionSummary).containsExactly("🔥", 2)
        assertThat(next.currentUserReactions).isNull()
    }

    @Test
    fun `my own reaction echo toggles my emoji`() {
        val next = StoryRealtimeFold.reactionDelta(post(), "❤️", actorId = "me", myId = "me", delta = 1)!!
        assertThat(next.reactionSummary).containsExactly("❤️", 1)
        assertThat(next.currentUserReactions).containsExactly("❤️")
        val back = StoryRealtimeFold.reactionDelta(next, "❤️", actorId = "me", myId = "me", delta = -1)!!
        assertThat(back.reactionSummary).isEmpty()
        assertThat(back.currentUserReactions).isEmpty()
    }

    @Test
    fun `an unreaction never goes below zero`() {
        val next = StoryRealtimeFold.reactionDelta(post(summary = mapOf("🔥" to 1)), "🔥", "u1", "me", -1)!!
        assertThat(next.reactionSummary).isEmpty()
        assertThat(StoryRealtimeFold.reactionDelta(post(summary = emptyMap()), "🔥", "u1", "me", -1)).isNull()
    }
}
