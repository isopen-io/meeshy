package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PostViewerEngagementMarksTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun decode(raw: String) = json.decodeFromString(PostViewerEngagement.serializer(), raw)

    @Test
    fun `les marques suivent l'ordre fixe et masquent les zeros`() {
        val e = PostViewerEngagement(reactions = listOf("❤️"), shareCount = 1, repostCount = 2, commentCount = 3, replyCount = 4)
        assertThat(e.marks).containsExactly(
            PostViewerEngagement.Mark.Reactions(listOf("❤️")),
            PostViewerEngagement.Mark.Comments(3),
            PostViewerEngagement.Mark.Replies(4),
            PostViewerEngagement.Mark.Reposts(2),
            PostViewerEngagement.Mark.Shares(1),
        ).inOrder()
        assertThat(PostViewerEngagement().marks).isEmpty()
    }

    @Test
    fun `une ligne d'identite seule decode a zero, la reaction historique devient l'unique reaction`() {
        val e = decode("""{"id":"x","userId":"u","reaction":"🔥","bookmarked":true}""")
        assertThat(e.reactions).containsExactly("🔥")
        assertThat(e.latestReaction).isEqualTo("🔥")
        assertThat(e.marks).hasSize(1)
    }

    @Test
    fun `les champs mal formes ou negatifs sont ignores sans faire tomber la liste`() {
        val e = decode("""{"reactions":"oops","commentCount":-2,"shareCount":"x","replyCount":5}""")
        assertThat(e.reactions).isEmpty()
        assertThat(e.commentCount).isEqualTo(0)
        assertThat(e.shareCount).isEqualTo(0)
        assertThat(e.marks).containsExactly(PostViewerEngagement.Mark.Replies(5))
    }
}
