package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

/** #14330 — la bulle dit à la carte d'« Imager » ce qu'elle peut peindre : la vignette d'une vidéo, et quelle photo est protégée. */
class BubbleImagerPiecesTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun photo(id: String, blurred: Boolean? = null) = ApiMessageAttachment(
        id = id, mimeType = "image/jpeg", fileName = "$id.jpg", fileUrl = "https://cdn.test/$id.jpg", width = 800, height = 600, isBlurred = blurred,
    )

    private val video = ApiMessageAttachment(
        id = "v1", mimeType = "video/mp4", fileName = "v1.mp4", fileUrl = "https://cdn.test/v1.mp4",
        thumbnailUrl = "https://cdn.test/v1.jpg", width = 1080, height = 1920,
    )

    private fun build(vararg pieces: ApiMessageAttachment) = BubbleContentBuilder.build(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "", originalLanguage = "fr", attachments = pieces.toList()),
        currentUserId = "me",
        preferences = prefs,
    )

    @Test
    fun `a video carries its poster and its size`() {
        val file = build(video).files.single()

        assertThat(file.thumbnailUrl).isEqualTo("https://cdn.test/v1.jpg")
        assertThat(file.width).isEqualTo(1080)
        assertThat(file.height).isEqualTo(1920)
    }

    @Test
    fun `an ordinary photo is open, and a blurred piece protects every photo of its message`() {
        assertThat(build(photo("p1")).images.single().isProtected).isFalse()

        val images = build(photo("p1"), photo("p2", blurred = true)).images

        assertThat(images.map { it.isProtected }).containsExactly(true, true)
    }
}
