package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test
import java.time.Instant

class PostSearchTest {

    private val now = Instant.parse("2026-11-02T12:00:00Z").toEpochMilli()

    private fun post(
        id: String = "p1",
        type: String? = "POST",
        expiresAt: String? = null,
        author: ApiAuthor? = ApiAuthor(id = "u1", username = "ada", displayName = "Ada"),
        translations: Map<String, ApiPostTranslationEntry>? = mapOf("fr" to ApiPostTranslationEntry(text = "Bonjour")),
        media: List<ApiPostMedia>? = null,
        storyEffects: StoryEffects? = null,
        repostOf: ApiRepostOf? = null,
    ) = ApiPost(
        id = id,
        type = type,
        content = "Hello",
        originalLanguage = "en",
        createdAt = "2026-11-02T10:00:00Z",
        expiresAt = expiresAt,
        author = author,
        translations = translations,
        media = media,
        storyEffects = storyEffects,
        repostOf = repostOf,
    )

    @Test
    fun `a post serves the translation of the first prism language that has one`() {
        val hit = PostSearch.hitOf(post(), listOf("fr", "en"), now)

        assertThat(hit?.text).isEqualTo("Bonjour")
        assertThat(hit?.authorName).isEqualTo("Ada")
        assertThat(hit?.createdAtMillis).isEqualTo(Instant.parse("2026-11-02T10:00:00Z").toEpochMilli())
    }

    @Test
    fun `a post serves its original when the reader reads its language first or has no prism`() {
        assertThat(PostSearch.hitOf(post(), listOf("en", "fr"), now)?.text).isEqualTo("Hello")
        assertThat(PostSearch.hitOf(post(), emptyList(), now)?.text).isEqualTo("Hello")
    }

    @Test
    fun `each kind opens its own surface`() {
        assertThat(PostSearch.hitOf(post(type = "POST"), emptyList(), now)?.destination)
            .isEqualTo(PostSearchDestination.Post("p1"))
        assertThat(PostSearch.hitOf(post(type = "REEL"), emptyList(), now)?.destination)
            .isEqualTo(PostSearchDestination.Reel("p1"))
        assertThat(PostSearch.hitOf(post(type = "story", expiresAt = "2026-11-03T10:00:00Z"), emptyList(), now)?.destination)
            .isEqualTo(PostSearchDestination.Story(authorId = "u1", storyId = "p1"))
    }

    @Test
    fun `a status, an unknown kind, an expired publication or one without author never shows`() {
        assertThat(PostSearch.hitOf(post(type = "STATUS"), emptyList(), now)).isNull()
        assertThat(PostSearch.hitOf(post(type = "POLL"), emptyList(), now)).isNull()
        assertThat(PostSearch.hitOf(post(type = null), emptyList(), now)).isNull()
        assertThat(PostSearch.hitOf(post(type = "STORY", expiresAt = "2026-11-02T11:59:59Z"), emptyList(), now)).isNull()
        assertThat(PostSearch.hitOf(post(author = null), emptyList(), now)).isNull()
    }

    private fun story(media: List<ApiPostMedia>? = null, effects: StoryEffects) =
        post(type = "STORY", expiresAt = "2026-11-03T10:00:00Z", media = media, storyEffects = effects)

    @Test
    fun `a story shows the image of its scene, the background first, by its address or by the media it names`() {
        val named = ApiPostMedia(id = "m1", fileUrl = "https://x/scene.jpg")
        val background = StoryMediaObject(id = "o1", postMediaId = "m1", isBackground = true)
        val sticker = StoryMediaObject(id = "o2", mediaURL = "https://x/sticker.jpg")

        assertThat(PostSearch.hitOf(story(listOf(named), StoryEffects(mediaObjects = listOf(sticker, background))), emptyList(), now)?.thumbnailUrl)
            .isEqualTo("https://x/scene.jpg")
        assertThat(PostSearch.hitOf(story(effects = StoryEffects(mediaObjects = listOf(sticker))), emptyList(), now)?.thumbnailUrl)
            .isEqualTo("https://x/sticker.jpg")
    }

    @Test
    fun `a republication without an image of its own shows its source's first image, story, post or reel alike`() {
        val source = ApiRepostOf(
            id = "src",
            type = "POST",
            media = listOf(
                ApiPostMedia(id = "a", mimeType = "image/jpeg", fileUrl = "https://x/a.jpg", thumbnailUrl = "https://x/a-t.jpg"),
                ApiPostMedia(id = "b", mimeType = "image/jpeg", fileUrl = "https://x/b.jpg"),
            ),
        )
        listOf("STORY", "POST", "REEL").forEach { type ->
            val republished = post(type = type, expiresAt = "2026-11-03T10:00:00Z", media = emptyList(), repostOf = source)
            assertThat(PostSearch.hitOf(republished, emptyList(), now)?.thumbnailUrl).isEqualTo("https://x/a-t.jpg")
        }
        val own = ApiPostMedia(id = "o", mimeType = "image/jpeg", fileUrl = "https://x/own.jpg")
        assertThat(PostSearch.hitOf(post(media = listOf(own), repostOf = source), emptyList(), now)?.thumbnailUrl)
            .isEqualTo("https://x/own.jpg")
    }

    @Test
    fun `a story made from a template shows its background image, never a colour nor a video`() {
        val video = StoryMediaObject(id = "v1", mediaURL = "https://x/clip.mp4", mediaType = "video", isBackground = true)

        assertThat(PostSearch.hitOf(story(effects = StoryEffects(background = "https://x/template.jpg")), emptyList(), now)?.thumbnailUrl)
            .isEqualTo("https://x/template.jpg")
        assertThat(PostSearch.hitOf(story(effects = StoryEffects(background = "#1E1B4B", mediaObjects = listOf(video))), emptyList(), now)?.thumbnailUrl)
            .isNull()
    }

    @Test
    fun `the thumbnail is the first media preview, a video file is never shown as an image`() {
        val video = ApiPostMedia(id = "v", mimeType = "video/mp4", fileUrl = "https://x/v.mp4")
        val image = ApiPostMedia(id = "i", mimeType = "image/jpeg", fileUrl = "https://x/i.jpg")
        val poster = ApiPostMedia(id = "w", mimeType = "video/mp4", fileUrl = "https://x/w.mp4", thumbnailUrl = "https://x/w.jpg")

        assertThat(PostSearch.hitOf(post(media = listOf(video, image)), emptyList(), now)?.thumbnailUrl).isEqualTo("https://x/i.jpg")
        assertThat(PostSearch.hitOf(post(media = listOf(poster)), emptyList(), now)?.thumbnailUrl).isEqualTo("https://x/w.jpg")
        assertThat(PostSearch.hitOf(post(media = listOf(video)), emptyList(), now)?.thumbnailUrl).isNull()
    }

    @Test
    fun `a publication returned twice is shown once`() {
        val hits = PostSearch.hitsOf(listOf(post(id = "a"), post(id = "a"), post(id = "b", type = "REEL")), emptyList(), now)

        assertThat(hits.map { it.postId }).containsExactly("a", "b").inOrder()
        assertThat(hits.map { it.kind }).containsExactly(PostType.POST, PostType.REEL).inOrder()
    }
}
