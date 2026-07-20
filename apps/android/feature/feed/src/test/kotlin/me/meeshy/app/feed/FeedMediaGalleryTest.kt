package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedMediaGalleryTest {

    private fun image(id: String, url: String, thumb: String? = null) =
        FeedPostImage(id = id, url = url, thumbnailUrl = thumb, width = null, height = null)

    private fun presentation(
        images: List<FeedPostImage>,
        content: String = "Hello world",
        authorName: String? = "Ada",
        createdAtIso: String? = "2026-07-18T10:00:00Z",
    ) = FeedPostPresentation(
        id = "p1",
        authorName = authorName,
        authorAvatarUrl = null,
        createdAtIso = createdAtIso,
        content = content,
        isTranslated = false,
        languageStrip = emptyList(),
        moodEmoji = null,
        images = images,
        likeCount = 0,
        isLiked = false,
        bookmarkCount = 0,
        isBookmarked = false,
        commentCount = 0,
        repostCount = 0,
        isPinned = false,
        isEdited = false,
        isReel = false,
        repostEmbed = null,
    )

    @Test
    fun `no images yields an empty gallery`() {
        val gallery = FeedMediaGallery.of(presentation(emptyList()), imageIndex = 0)

        assertThat(gallery.isEmpty).isTrue()
        assertThat(gallery.pages).isEmpty()
        assertThat(gallery.imageUrls).isEmpty()
        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun `single image opens at index zero`() {
        val gallery = FeedMediaGallery.of(
            presentation(listOf(image("a", "https://cdn/a.jpg"))),
            imageIndex = 0,
        )

        assertThat(gallery.isEmpty).isFalse()
        assertThat(gallery.imageUrls).containsExactly("https://cdn/a.jpg")
        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun `pages preserve image order and expose full-resolution urls`() {
        val gallery = FeedMediaGallery.of(
            presentation(
                listOf(
                    image("a", url = "https://cdn/a-full.jpg", thumb = "https://cdn/a-thumb.jpg"),
                    image("b", url = "https://cdn/b-full.jpg", thumb = "https://cdn/b-thumb.jpg"),
                    image("c", url = "https://cdn/c-full.jpg"),
                ),
            ),
            imageIndex = 1,
        )

        assertThat(gallery.imageUrls)
            .containsExactly("https://cdn/a-full.jpg", "https://cdn/b-full.jpg", "https://cdn/c-full.jpg")
            .inOrder()
    }

    @Test
    fun `tapping a middle image starts the gallery there`() {
        val gallery = FeedMediaGallery.of(
            presentation(
                listOf(image("a", "a"), image("b", "b"), image("c", "c")),
            ),
            imageIndex = 2,
        )

        assertThat(gallery.startIndex).isEqualTo(2)
    }

    @Test
    fun `a negative tapped index clamps to the first image`() {
        val gallery = FeedMediaGallery.of(
            presentation(listOf(image("a", "a"), image("b", "b"))),
            imageIndex = -5,
        )

        assertThat(gallery.startIndex).isEqualTo(0)
    }

    @Test
    fun `a tapped index past the last image clamps to the last`() {
        val gallery = FeedMediaGallery.of(
            presentation(listOf(image("a", "a"), image("b", "b"))),
            imageIndex = 99,
        )

        assertThat(gallery.startIndex).isEqualTo(1)
    }

    @Test
    fun `post text becomes the shared caption for every page`() {
        val gallery = FeedMediaGallery.of(
            presentation(
                images = listOf(image("a", "a"), image("b", "b")),
                content = "Sunset run",
            ),
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly("Sunset run", "Sunset run")
    }

    @Test
    fun `blank post text yields no caption overlay`() {
        val gallery = FeedMediaGallery.of(
            presentation(images = listOf(image("a", "a")), content = "   "),
            imageIndex = 0,
        )

        assertThat(gallery.captions).containsExactly(null as String?)
    }

    @Test
    fun `author name is trimmed and shared across pages`() {
        val gallery = FeedMediaGallery.of(
            presentation(
                images = listOf(image("a", "a"), image("b", "b")),
                authorName = "  Ada Lovelace  ",
            ),
            imageIndex = 0,
        )

        assertThat(gallery.authorNames).containsExactly("Ada Lovelace", "Ada Lovelace")
    }

    @Test
    fun `blank or absent author collapses to null`() {
        val blank = FeedMediaGallery.of(
            presentation(images = listOf(image("a", "a")), authorName = "  "),
            imageIndex = 0,
        )
        val absent = FeedMediaGallery.of(
            presentation(images = listOf(image("a", "a")), authorName = null),
            imageIndex = 0,
        )

        assertThat(blank.authorNames).containsExactly(null as String?)
        assertThat(absent.authorNames).containsExactly(null as String?)
    }

    @Test
    fun `timestamp is trimmed and null when blank or absent`() {
        val present = FeedMediaGallery.of(
            presentation(
                images = listOf(image("a", "a")),
                createdAtIso = "  2026-07-18T10:00:00Z  ",
            ),
            imageIndex = 0,
        )
        val blank = FeedMediaGallery.of(
            presentation(images = listOf(image("a", "a")), createdAtIso = "   "),
            imageIndex = 0,
        )
        val absent = FeedMediaGallery.of(
            presentation(images = listOf(image("a", "a")), createdAtIso = null),
            imageIndex = 0,
        )

        assertThat(present.createdAtIsos).containsExactly("2026-07-18T10:00:00Z")
        assertThat(blank.createdAtIsos).containsExactly(null as String?)
        assertThat(absent.createdAtIsos).containsExactly(null as String?)
    }

    @Test
    fun `every derived list is positionally aligned with the pages`() {
        val gallery = FeedMediaGallery.of(
            presentation(
                images = listOf(image("a", "a"), image("b", "b"), image("c", "c")),
                content = "Trip",
                authorName = "Ada",
                createdAtIso = "2026-07-18T10:00:00Z",
            ),
            imageIndex = 0,
        )

        assertThat(gallery.imageUrls).hasSize(3)
        assertThat(gallery.captions).hasSize(3)
        assertThat(gallery.authorNames).hasSize(3)
        assertThat(gallery.createdAtIsos).hasSize(3)
    }
}
