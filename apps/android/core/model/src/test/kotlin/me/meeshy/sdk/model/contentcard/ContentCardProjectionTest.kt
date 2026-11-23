package me.meeshy.sdk.model.contentcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.PostType
import org.junit.Test

/** Le post servi au lecteur devient la carte (contrat #19331 § 2 et § 4) : genre, auteur, texte du Prisme, média, compteurs. */
class ContentCardProjectionTest {

    private data class Reader(
        override val systemLanguage: String?,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val author = ApiAuthor(id = "u1", username = "amani", displayName = "Amani", avatar = "avatars/u1.jpg")

    private fun post(
        type: String? = "POST",
        content: String? = "Hello",
        originalLanguage: String? = "en",
        translations: Map<String, ApiPostTranslationEntry>? = null,
        media: List<ApiPostMedia>? = null,
        repostOf: ApiRepostOf? = null,
        moodEmoji: String? = null,
    ) = ApiPost(
        id = "p1",
        type = type,
        content = content,
        originalLanguage = originalLanguage,
        translations = translations,
        author = author,
        media = media,
        repostOf = repostOf,
        moodEmoji = moodEmoji,
        createdAt = "2026-11-17T10:00:00.000Z",
        viewCount = 1234,
        likeCount = 5,
        commentCount = 0,
        bookmarkCount = 2,
        isBookmarkedByMe = true,
    )

    private fun image(id: String, width: Int? = 1200, height: Int? = 800, thumbnail: String? = "thumbs/$id.jpg") =
        ApiPostMedia(id = id, mimeType = "image/jpeg", fileUrl = "files/$id.jpg", thumbnailUrl = thumbnail, width = width, height = height, thumbHash = "hash-$id")

    private fun video(id: String, durationMs: Int? = 42_500) =
        ApiPostMedia(id = id, mimeType = "video/mp4", fileUrl = "files/$id.mp4", thumbnailUrl = "thumbs/$id.jpg", width = 1080, height = 1920, duration = durationMs)

    private fun card(post: ApiPost, reader: Reader? = Reader("en"), linkType: PostType? = null) =
        ContentCardProjection.of(post, reader, linkType)

    private fun mediaOf(post: ApiPost): ContentCardMedia = checkNotNull(card(post).media) { "la carte devait porter un média" }

    @Test
    fun `the card carries the post identity, its author and every counter, the bookmark filled for its saver`() {
        val card = card(post())

        assertThat(card.postId).isEqualTo("p1")
        assertThat(card.type).isEqualTo(PostType.POST)
        assertThat(card.author).isEqualTo(ContentCardAuthor(id = "u1", name = "Amani", avatarUrl = "avatars/u1.jpg"))
        assertThat(card.stats).isEqualTo(ContentCardStats(views = 1234, likes = 5, comments = 0, bookmarks = 2, isBookmarkedByMe = true))
        assertThat(card.createdAtIso).isEqualTo("2026-11-17T10:00:00.000Z")
    }

    @Test
    fun `without a display name the author is its handle, and missing counters read zero`() {
        val anonymousName = post().copy(author = author.copy(displayName = " "), viewCount = null, bookmarkCount = null, isBookmarkedByMe = null)

        val card = card(anonymousName)

        assertThat(card.author.name).isEqualTo("@amani")
        assertThat(card.stats.views).isEqualTo(0)
        assertThat(card.stats.bookmarks).isEqualTo(0)
        assertThat(card.stats.isBookmarkedByMe).isFalse()
    }

    @Test
    fun `the genre is the served one, else the link's, else a post`() {
        assertThat(card(post(type = "REEL")).type).isEqualTo(PostType.REEL)
        assertThat(card(post(type = null), linkType = PostType.STORY).type).isEqualTo(PostType.STORY)
        assertThat(card(post(type = "FUTURE")).type).isEqualTo(PostType.POST)
    }

    @Test
    fun `the text is served by the reader's prism, a lower rank winning when the first has no translation`() {
        val translated = post(
            content = "Hello",
            originalLanguage = "en",
            translations = mapOf("fr" to ApiPostTranslationEntry(text = "Bonjour"), "es" to ApiPostTranslationEntry(text = "Hola")),
        )

        assertThat(card(translated, Reader(systemLanguage = "de", regionalLanguage = "fr")).text).isEqualTo("Bonjour")
        assertThat(card(translated, Reader(systemLanguage = "fr", regionalLanguage = "en")).text).isEqualTo("Bonjour")
        assertThat(card(translated, Reader(systemLanguage = "it", regionalLanguage = "en")).text).isEqualTo("Hello")
        assertThat(card(translated, reader = null).text).isEqualTo("Hello")
    }

    @Test
    fun `an image shows its thumbnail framed between four by five and sixteen by nine, and counts the others`() {
        val wide = mediaOf(post(media = listOf(image("m1", width = 4000, height = 1000), image("m2"), video("m3"))))
        val tall = mediaOf(post(media = listOf(image("m1", width = 1000, height = 3000))))
        val unsized = mediaOf(post(media = listOf(image("m1", width = null, height = null, thumbnail = null))))

        assertThat(wide.imageUrl).isEqualTo("thumbs/m1.jpg")
        assertThat(wide.thumbHash).isEqualTo("hash-m1")
        assertThat(wide.isVideo).isFalse()
        assertThat(wide.aspectRatio).isWithin(1e-4f).of(16f / 9f)
        assertThat(wide.maxHeightDp).isEqualTo(220)
        assertThat(wide.extraCount).isEqualTo(2)
        assertThat(tall.aspectRatio).isWithin(1e-4f).of(4f / 5f)
        assertThat(tall.extraCount).isEqualTo(0)
        assertThat(unsized.imageUrl).isEqualTo("files/m1.jpg")
        assertThat(unsized.aspectRatio).isWithin(1e-4f).of(4f / 3f)
    }

    @Test
    fun `a video shows its thumbnail and its duration in seconds`() {
        val media = mediaOf(post(media = listOf(video("m1"))))

        assertThat(media.isVideo).isTrue()
        assertThat(media.imageUrl).isEqualTo("thumbs/m1.jpg")
        assertThat(media.durationSeconds).isEqualTo(42)
        assertThat(mediaOf(post(media = listOf(video("m1", durationMs = null)))).durationSeconds).isNull()
        assertThat(mediaOf(post(media = listOf(image("m1")))).durationSeconds).isNull()
    }

    @Test
    fun `a reel or a story is framed in portrait, up to its taller height`() {
        listOf("REEL", "STORY").forEach { type ->
            val media = mediaOf(post(type = type, media = listOf(image("m1", width = 4000, height = 1000))))
            assertThat(media.aspectRatio).isWithin(1e-4f).of(9f / 16f)
            assertThat(media.maxHeightDp).isEqualTo(260)
        }
    }

    @Test
    fun `a post without a visual medium has no media block and keeps three lines of text`() {
        val audioOnly = card(post(media = listOf(ApiPostMedia(id = "a1", mimeType = "audio/mpeg", fileUrl = "files/a1.mp3"))))

        assertThat(audioOnly.media).isNull()
        assertThat(audioOnly.textMaxLines).isEqualTo(3)
        assertThat(card(post(media = listOf(image("m1")))).textMaxLines).isEqualTo(2)
    }

    @Test
    fun `a mood shows its emoji before its text`() {
        val mood = card(post(type = "STATUS", content = "Au soleil", moodEmoji = "☀️"))

        assertThat(mood.type).isEqualTo(PostType.STATUS)
        assertThat(mood.moodEmoji).isEqualTo("☀️")
        assertThat(card(post(moodEmoji = " ")).moodEmoji).isNull()
    }

    @Test
    fun `a repost with neither text nor medium of its own shows the original, keeping its own identity and counters`() {
        val original = ApiRepostOf(
            id = "o1",
            type = "REEL",
            content = "Original",
            originalLanguage = "en",
            translations = mapOf("fr" to ApiPostTranslationEntry(text = "Originel")),
            author = ApiAuthor(id = "u2", username = "bea", displayName = "Béa"),
            media = listOf(video("v1")),
            createdAt = "2026-11-01T08:00:00.000Z",
            moodEmoji = null,
        )

        val card = card(post(content = "", media = null, repostOf = original), Reader(systemLanguage = "de", regionalLanguage = "fr"))

        assertThat(card.postId).isEqualTo("p1")
        assertThat(card.author.name).isEqualTo("Béa")
        assertThat(card.text).isEqualTo("Originel")
        assertThat(card.media?.isVideo).isTrue()
        assertThat(card.media?.aspectRatio).isWithin(1e-4f).of(9f / 16f)
        assertThat(card.createdAtIso).isEqualTo("2026-11-01T08:00:00.000Z")
        assertThat(card.stats.views).isEqualTo(1234)
    }

    @Test
    fun `a quote keeps its own text and its own author`() {
        val original = ApiRepostOf(id = "o1", content = "Original", author = ApiAuthor(id = "u2", displayName = "Béa"))

        val card = card(post(content = "Look at this", repostOf = original))

        assertThat(card.text).isEqualTo("Look at this")
        assertThat(card.author.name).isEqualTo("Amani")
    }
}
