package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentLiveSyncTest {
    private val heart = "❤️"
    private fun comment(id: String, likes: Int = 0, mine: List<String> = emptyList()) =
        ApiPostComment(id = id, likeCount = likes, currentUserReactions = mine)

    private fun aggregation(count: Int, vararg users: String) =
        SocketCommentReactionAggregation(emoji = heart, count = count, userIds = users.toList())

    @Test
    fun `l agregat absolu pose le compte et derive mon coeur de la liste des userIds`() {
        val thread = CommentThreadState(comments = listOf(comment("c1", likes = 1)))
        val next = thread.reactionAggregated("c1", aggregation(2, "me", "other"), viewerId = "me", heart = heart)
        val row = next.comments.single()
        assertThat(row.likeCount).isEqualTo(2)
        assertThat(row.currentUserReactions).contains(heart)
        assertThat(row.reactionSummary).containsExactly(heart, 2)
    }

    @Test
    fun `un acteur tiers ne change jamais mon coeur`() {
        val thread = CommentThreadState(comments = listOf(comment("c1", likes = 1, mine = listOf(heart))))
        val next = thread.reactionAggregated("c1", aggregation(2, "me", "other"), viewerId = "me", heart = heart)
        assertThat(next.comments.single().currentUserReactions).contains(heart)
        val retired = next.reactionAggregated("c1", aggregation(1, "other"), viewerId = "me", heart = heart)
        assertThat(retired.comments.single().currentUserReactions).doesNotContain(heart)
    }

    @Test
    fun `un compte a zero retire l emoji du resume`() {
        val withSummary = CommentThreadState(comments = listOf(comment("c1").copy(reactionSummary = mapOf(heart to 1))))
        val next = withSummary.reactionAggregated("c1", aggregation(0), viewerId = "me", heart = heart)
        assertThat(next.comments.single().reactionSummary).isEmpty()
    }

    @Test
    fun `un commentaire inconnu laisse le fil identique`() {
        val thread = CommentThreadState(comments = listOf(comment("c1")))
        assertThat(thread.reactionAggregated("zz", aggregation(1, "me"), "me", heart)).isSameInstanceAs(thread)
    }

    @Test
    fun `l agregat atteint aussi une reponse chargee`() {
        val replies = CommentRepliesState().loaded("p", listOf(comment("r1")))
        val next = replies.reactionAggregated("r1", aggregation(1, "me"), "me", heart)
        assertThat(next.repliesFor("p").single().likeCount).isEqualTo(1)
    }

    @Test
    fun `le coeur local suit l agregat et l ecart optimiste tombe`() {
        val likes = CommentLikeState(likedIds = setOf("c1"), deltas = mapOf("c1" to 1))
        val next = likes.aggregated("c1", viewerHeart = false)
        assertThat(next.isLiked("c1")).isFalse()
        assertThat(next.deltas).isEmpty()
    }

    @Test
    fun `un basculement en vol garde son ecart`() {
        val likes = CommentLikeState(likedIds = setOf("c1"), deltas = mapOf("c1" to 1), inFlightIds = setOf("c1"))
        assertThat(likes.aggregated("c1", viewerHeart = null).deltas).containsExactly("c1", 1)
    }

    @Test
    fun `media-updated reecrit lieu et medias sans toucher au contenu`() {
        val thread = CommentThreadState(comments = listOf(ApiPostComment(id = "c1", content = "salut")))
        val update = ApiPostComment(id = "c1", content = "ignored", media = emptyList())
        val next = thread.mediaRewritten(update)
        assertThat(next.comments.single().content).isEqualTo("salut")
        assertThat(next.comments.single().media).isEmpty()
    }
}
