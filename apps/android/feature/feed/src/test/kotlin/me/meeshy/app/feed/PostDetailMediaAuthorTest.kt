package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import org.junit.Test

class PostDetailMediaAuthorTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val quoted = ApiRepostOf(
        id = "orig-1",
        originalLanguage = "es",
        createdAt = "2026-07-01T10:00:00Z",
        author = ApiAuthor(id = "u9", username = "orig", displayName = "Origen", avatar = "/av/o.png"),
        media = listOf(ApiPostMedia(id = "vox", mimeType = "audio/mpeg", fileUrl = "/u/vox.mp3", duration = 4000)),
    )

    @Test
    fun `le post exterieur porte son propre auteur`() {
        val outer = feedPostPresentation(id = "outer-1", authorName = "Amina")

        val owner = DetailMediaAuthor.of(outer)

        assertThat(owner.id).isEqualTo("outer-1")
        assertThat(owner.name).isEqualTo("Amina")
        assertThat(owner.userId).isEqualTo("u1")
    }

    @Test
    fun `l'audio d'un repost cite est attribue a l'auteur cite et non au post exterieur`() {
        val embed = RepostEmbedBuilder.build(quoted, Prefs, mediaBaseUrl = null)!!

        val owner = DetailMediaAuthor.of(embed)

        assertThat(owner.id).isEqualTo("orig-1")
        assertThat(owner.name).isEqualTo("Origen")
        assertThat(owner.userId).isEqualTo("u9")
        assertThat(owner.createdAtIso).isEqualTo("2026-07-01T10:00:00Z")
        assertThat(owner.originalLanguage).isEqualTo("es")
    }

    @Test
    fun `la citation porte ses medias dans l'ordre serveur`() {
        val embed = RepostEmbedBuilder.build(quoted, Prefs, mediaBaseUrl = null)!!

        assertThat(embed.media.map { it.id }).containsExactly("vox")
    }

    @Test
    fun `la galerie d'une citation attribue ses pages a l'auteur cite`() {
        val withImage = quoted.copy(media = listOf(ApiPostMedia(id = "img", mimeType = "image/jpeg", fileUrl = "/u/a.jpg")))
        val embed = RepostEmbedBuilder.build(withImage, Prefs, mediaBaseUrl = null)!!

        val gallery = FeedMediaGallery.ofQuotedVisuals(embed, 0)

        assertThat(gallery.authorNames).containsExactly("Origen")
        assertThat(gallery.authorId).isEqualTo("u9")
        assertThat(gallery.postId).isEqualTo("orig-1")
    }
}
