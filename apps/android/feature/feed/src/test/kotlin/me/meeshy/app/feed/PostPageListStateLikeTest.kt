package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

class PostPageListStateLikeTest {

    private fun state(vararg posts: ApiPost) = PostPageListState().appended(posts.toList(), null, false)

    @Test
    fun `aimer pose l etat et ajoute un au total`() {
        val next = state(ApiPost(id = "a", likeCount = 2, isLikedByMe = false)).liked("a", true)

        assertThat(next.posts.single().isLikedByMe).isTrue()
        assertThat(next.posts.single().likeCount).isEqualTo(3)
    }

    @Test
    fun `ne plus aimer ne descend jamais sous zero`() {
        val next = state(ApiPost(id = "a", likeCount = 0, isLikedByMe = true)).liked("a", false)

        assertThat(next.posts.single().likeCount).isEqualTo(0)
        assertThat(next.posts.single().isLikedByMe).isFalse()
    }

    @Test
    fun `un post absent ou deja dans l etat laisse la meme instance`() {
        val s = state(ApiPost(id = "a", likeCount = 1, isLikedByMe = true))

        assertThat(s.liked("zzz", true)).isSameInstanceAs(s)
        assertThat(s.liked("a", true)).isSameInstanceAs(s)
    }

    @Test
    fun `enregistrer ajoute un au total et le retrait le reprend`() {
        val s = state(ApiPost(id = "a", bookmarkCount = 4, isBookmarkedByMe = false))

        val saved = s.bookmarked("a", true)
        assertThat(saved.posts.single().bookmarkCount).isEqualTo(5)
        assertThat(saved.bookmarked("a", false).posts.single().bookmarkCount).isEqualTo(4)
        assertThat(s.bookmarked("zzz", true)).isSameInstanceAs(s)
    }
}
