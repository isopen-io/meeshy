package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.MeeshyImageVariant
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryAudioPlayerObject
import org.junit.Test

class CacheAttributionDeriverTest {

    private fun message(vararg attachments: ApiMessageAttachment) =
        ApiMessage(id = "m", conversationId = "c", attachments = attachments.toList())

    @Test
    fun `les pieces jointes d un message vont dans le domaine conversations par leur type`() {
        val index = CacheAttributionDeriver.indexMessages(
            listOf(
                message(
                    ApiMessageAttachment(id = "a", fileUrl = "https://x/a.bin", mimeType = "image/png", thumbnailUrl = "https://x/t"),
                    ApiMessageAttachment(id = "b", fileUrl = "https://x/b.bin", mimeType = "video/mp4"),
                    ApiMessageAttachment(
                        id = "c", fileUrl = "https://x/c.bin", mimeType = "audio/mpeg",
                        translations = mapOf("en" to ApiAttachmentTranslation(url = "https://x/c-en")),
                        imageVariants = listOf(MeeshyImageVariant(10, 10, "https://x/v.webp", 1)),
                    ),
                    ApiMessageAttachment(id = "d", fileUrl = "https://x/d.pdf", mimeType = "application/pdf"),
                ),
            ),
        )

        assertThat(index.images).containsExactly("https://x/a.bin", "https://x/t", "https://x/v.webp")
        assertThat(index.videos).containsExactly("https://x/b.bin")
        assertThat(index.audio).containsExactly("https://x/c.bin", "https://x/c-en")
    }

    @Test
    fun `l extension prime sur le type declare`() {
        val index = CacheAttributionDeriver.indexMessages(
            listOf(message(ApiMessageAttachment(id = "a", fileUrl = "https://x/clip.mp4?sig=1", mimeType = "image/png"))),
        )

        assertThat(index.videos).containsExactly("https://x/clip.mp4?sig=1")
        assertThat(index.images).isEmpty()
    }

    @Test
    fun `les stories portent leurs medias de canevas et l avatar de l auteur`() {
        val story = ApiPost(
            id = "s",
            author = ApiAuthor(id = "u", avatar = "https://x/avatar"),
            media = listOf(ApiPostMedia(id = "1", fileUrl = "https://x/s.jpg")),
            audioUrl = "https://x/s.m4a",
            storyEffects = StoryEffects(
                mediaObjects = listOf(StoryMediaObject(id = "o", mediaURL = "https://x/bg.bin", mediaType = "video")),
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "p", mediaURL = "https://x/track.bin")),
            ),
        )

        val index = CacheAttributionDeriver.indexStories(listOf(story))

        assertThat(index.images).containsExactly("https://x/avatar", "https://x/s.jpg")
        assertThat(index.videos).containsExactly("https://x/bg.bin")
        assertThat(index.audio).containsExactly("https://x/s.m4a", "https://x/track.bin")
    }

    @Test
    fun `le fil se ventile entre publications et reels et le repost est inclus`() {
        val post = ApiPost(
            id = "p",
            type = "POST",
            media = listOf(ApiPostMedia(id = "1", fileUrl = "https://x/p.jpg")),
            repostOf = ApiRepostOf(id = "r", media = listOf(ApiPostMedia(id = "2", fileUrl = "https://x/r.jpg")), audioUrl = "https://x/r.m4a"),
        )
        val reel = ApiPost(id = "q", type = "reel", media = listOf(ApiPostMedia(id = "3", fileUrl = "https://x/q.mp4")))

        val index = CacheAttributionDeriver.indexFeed(listOf(post, reel))

        assertThat(index.getValue(CacheDomain.POSTS).images).containsExactly("https://x/p.jpg", "https://x/r.jpg")
        assertThat(index.getValue(CacheDomain.POSTS).audio).containsExactly("https://x/r.m4a")
        assertThat(index.getValue(CacheDomain.REELS).videos).containsExactly("https://x/q.mp4")
        assertThat(index.getValue(CacheDomain.REELS).images).isEmpty()
    }

    @Test
    fun `aucune entite donne un index vide`() {
        assertThat(CacheAttributionDeriver.indexMessages(emptyList()).isEmpty).isTrue()
        assertThat(CacheAttributionDeriver.indexStories(emptyList()).isEmpty).isTrue()
    }
}
