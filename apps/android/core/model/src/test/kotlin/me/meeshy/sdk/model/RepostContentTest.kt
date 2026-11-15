package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RepostContentTest {
    @Test
    fun `les pseudos cliquables viennent des mentions et nul se propage`() {
        assertThat(RepostContent(id = "r").validMentionUsernames).isNull()
        assertThat(RepostContent(id = "r", mentions = emptyList()).validMentionUsernames).isEmpty()
        val withMentions = RepostContent(id = "r", mentions = listOf(PostReference("u", "BoB")))
        assertThat(withMentions.validMentionUsernames).containsExactly("bob")
    }

    @Test
    fun `un reel reposte met la video en premier`() {
        val r = RepostContent(
            id = "r", type = "reel",
            media = listOf(FeedMedia(id = "i", type = FeedMediaType.IMAGE), FeedMedia(id = "v", type = FeedMediaType.VIDEO)),
        )
        assertThat(r.primaryReelMedia?.id).isEqualTo("v")
        assertThat(r.copy(type = "POST").primaryReelMedia).isNull()
    }
}
