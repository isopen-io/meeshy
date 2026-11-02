package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostDetailLandingTest {
    @Test
    fun `sans argument la route reste celle d'avant`() {
        assertThat(PostDetailLanding.route("p1")).isEqualTo("feed/post/p1")
        assertThat(PostDetailLanding.from(null, null, null).opensComments).isFalse()
    }

    @Test
    fun `une reponse vise le commentaire parent et la reponse`() {
        val route = PostDetailLanding.route("p1", showComments = true, commentId = "c2", parentCommentId = "c1")
        assertThat(route).isEqualTo("feed/post/p1?showComments=true&commentId=c2&parentCommentId=c1")
    }

    @Test
    fun `un identifiant est encode`() {
        assertThat(PostDetailLanding.route("p1", commentId = "a b")).isEqualTo("feed/post/p1?commentId=a%20b")
    }

    @Test
    fun `les arguments de route se relisent`() {
        val landing = PostDetailLanding.from("true", "c2", "")
        assertThat(landing).isEqualTo(PostDetailLanding(showComments = true, commentId = "c2", parentCommentId = null))
    }

    @Test
    fun `un commentaire vise ouvre les commentaires meme sans le drapeau`() {
        assertThat(PostDetailLanding.from(null, "c2", null).opensComments).isTrue()
    }
}
