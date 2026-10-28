package me.meeshy.sdk.model.visitor

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiMediaCaptionTranslationEntry
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

class VisitorReadableTest {
    private fun post(
        content: String? = "Hello",
        language: String? = "en",
        translations: Map<String, ApiPostTranslationEntry>? = null,
        media: List<ApiPostMedia>? = null,
    ) = ApiPost(
        id = "p1", content = content, originalLanguage = language, translations = translations, media = media,
        author = ApiAuthor(id = "a", username = "alice", displayName = "Alice", avatar = "/u/a.png"),
    )

    private val french = mapOf("fr" to ApiPostTranslationEntry(text = "Bonjour"))

    @Test
    fun `sans compte, la locale de l appareil choisit la traduction`() {
        val readable = post(translations = french).toVisitorReadable(deviceLocale = "fr-FR")
        assertThat(readable.text).isEqualTo("Bonjour")
        assertThat(readable.isTranslated).isTrue()
    }

    @Test
    fun `aucune traduction vers la langue de l appareil laisse l original`() {
        val readable = post(translations = french).toVisitorReadable(deviceLocale = "de-DE")
        assertThat(readable.text).isEqualTo("Hello")
        assertThat(readable.isTranslated).isFalse()
    }

    @Test
    fun `un contenu deja ecrit dans la langue de l appareil reste l original`() {
        assertThat(post(translations = french).toVisitorReadable(deviceLocale = "en-US").text).isEqualTo("Hello")
    }

    @Test
    fun `l auteur se lit par son nom affiche sinon son pseudo`() {
        val readable = post().toVisitorReadable(deviceLocale = null)
        assertThat(readable.authorName).isEqualTo("Alice")
        assertThat(readable.authorUsername).isEqualTo("alice")
        val bare = ApiPost(id = "p", author = ApiAuthor(id = "a", username = "bob")).toVisitorReadable(null)
        assertThat(bare.authorName).isEqualTo("bob")
        assertThat(ApiPost(id = "p").toVisitorReadable(null).authorName).isEmpty()
    }

    @Test
    fun `seuls l image et la video se lisent, dans l ordre servi, legende au prisme`() {
        val media = listOf(
            ApiPostMedia(id = "2", mimeType = "image/png", fileUrl = "/b.png", order = 1, width = 200, height = 100),
            ApiPostMedia(id = "1", mimeType = "video/mp4", fileUrl = "/a.mp4", order = 0, thumbnailUrl = "/a.jpg"),
            ApiPostMedia(id = "3", mimeType = "audio/mpeg", fileUrl = "/c.mp3", order = 2),
            ApiPostMedia(id = "4", mimeType = "image/png", fileUrl = null, order = 3),
            ApiPostMedia(
                id = "5", mimeType = "image/jpeg", fileUrl = "/e.jpg", order = 4, caption = "Cat", captionLanguage = "en",
                captionTranslations = mapOf("fr" to ApiMediaCaptionTranslationEntry(text = "Chat")),
            ),
        )
        val readable = post(media = media).toVisitorReadable(deviceLocale = "fr")
        assertThat(readable.media.map { it.id }).containsExactly("1", "2", "5").inOrder()
        assertThat(readable.media.map { it.kind }).containsExactly(VisitorMediaKind.VIDEO, VisitorMediaKind.IMAGE, VisitorMediaKind.IMAGE).inOrder()
        assertThat(readable.media[1].aspectRatio).isEqualTo(2f)
        assertThat(readable.media[2].caption).isEqualTo("Chat")
        assertThat(readable.primaryVideoId).isEqualTo("1")
    }
}
