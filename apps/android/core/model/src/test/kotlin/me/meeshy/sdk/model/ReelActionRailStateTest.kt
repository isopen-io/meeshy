package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelActionRailStateTest {

    private fun state(liked: Boolean = false, bookmarked: Boolean = false, reposted: Boolean = false) =
        ReelActionRailState.of(liked, 3, 4, bookmarked, 5, reposted, 6)

    @Test
    fun `au repos aucune cellule n est teintee`() {
        val s = state()
        assertThat(listOf(s.like, s.comment, s.bookmark, s.repost).map { it.tint }).containsExactly(
            ReelRailTint.NONE, ReelRailTint.NONE, ReelRailTint.NONE, ReelRailTint.NONE,
        )
    }

    @Test
    fun `le coeur actif est teinte erreur le favori ambre et republier vert`() {
        val s = state(liked = true, bookmarked = true, reposted = true)
        assertThat(s.like.tint).isEqualTo(ReelRailTint.ERROR)
        assertThat(s.bookmark.tint).isEqualTo(ReelRailTint.WARNING)
        assertThat(s.repost.tint).isEqualTo(ReelRailTint.SUCCESS)
        assertThat(s.like.isActive).isTrue()
    }

    @Test
    fun `les compteurs sont recopies tels quels`() {
        val s = state()
        assertThat(listOf(s.like.count, s.comment.count, s.bookmark.count, s.repost.count)).containsExactly(3, 4, 5, 6).inOrder()
    }

    @Test
    fun `commenter n est jamais actif`() {
        assertThat(state(liked = true).comment.isActive).isFalse()
    }
}
