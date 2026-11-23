package me.meeshy.sdk.model.contentcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import org.junit.Test

/**
 * Le texte d'un post déplie son premier lien de contenu en carte (contrat #19331 § 5.2) : jamais le post lui-même, et
 * pas quand une vidéo intégrée tient déjà la place sous le texte.
 */
class PostTextContentLinkTest {

    private val self = "66f0c0ffee0000000000c0de"
    private val other = "66f0c0ffee0000000000beef"

    private fun target(vararg urls: String, embedsVideo: Boolean = false) =
        PostTextContentLink.target(urls.toList(), embedsVideo, postId = self)

    @Test
    fun `the first content link of the text gets the card`() {
        assertThat(target("https://example.org", "https://meeshy.me/reel/$other"))
            .isEqualTo(ContentLinkTarget.Content(other, PostType.REEL))
        assertThat(target("https://meeshy.me/l/Ab3xYz")).isEqualTo(ContentLinkTarget.Tracked("Ab3xYz"))
    }

    @Test
    fun `a post never shows its own card, whatever the case of its id`() {
        assertThat(target("https://meeshy.me/post/$self")).isNull()
        assertThat(target("https://meeshy.me/post/${self.uppercase()}", "https://meeshy.me/mood/$other"))
            .isEqualTo(ContentLinkTarget.Content(other, PostType.STATUS))
    }

    @Test
    fun `a video embedded under the text keeps its place`() {
        assertThat(target("https://meeshy.me/post/$other", embedsVideo = true)).isNull()
    }

    @Test
    fun `a text without a content link shows no card`() {
        assertThat(target()).isNull()
        assertThat(target("https://example.org", "https://meeshy.me/u/amani")).isNull()
    }
}
