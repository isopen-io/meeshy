package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

/** #13727 — UNE couleur d'auteur pour un post (iOS `FeedPost.authorColor`) : la carte du fil et le lecteur de réels la lisent ici. */
class PostAuthorAccentTest {

    @Test
    fun `la couleur d un post est celle de son auteur, de son type et de sa langue`() {
        val post = ApiPost(id = "p", type = "REEL", originalLanguage = "fr", author = ApiAuthor(id = "u1", username = "amina"))
        assertThat(post.authorAccentHex()).isEqualTo(DynamicColorGenerator.colorForPost("u1", "REEL", "fr"))
    }

    @Test
    fun `sans identifiant d auteur la couleur vient du nom affiche, puis du pseudo`() {
        val named = ApiPost(id = "p", type = "REEL", author = ApiAuthor(id = " ", username = "amina", displayName = "Amina K"))
        val handle = ApiPost(id = "p", type = "REEL", author = ApiAuthor(id = "", username = "amina"))
        assertThat(named.authorAccentHex()).isEqualTo(DynamicColorGenerator.colorForPost("Amina K", "REEL", null))
        assertThat(handle.authorAccentHex()).isEqualTo(DynamicColorGenerator.colorForPost("amina", "REEL", null))
    }

    @Test
    fun `un post sans auteur a une couleur stable`() {
        assertThat(ApiPost(id = "p", type = "REEL").authorAccentHex()).isEqualTo(DynamicColorGenerator.colorForPost("", "REEL", null))
    }
}
