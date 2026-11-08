package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.SocialMediaGalleryPresentation
import org.junit.Test

/** Le fil, le détail, le commentaire et le reel ouvrent la MÊME composition : celle que la loi commune donne du post. */
class SocialGalleryEntryTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun media(id: String, caption: String?) =
        ApiPostMedia(id = id, mimeType = "image/jpeg", fileUrl = "https://m/$id.jpg", thumbnailUrl = "https://m/$id-t.jpg", caption = caption)

    private val apiPost = ApiPost(
        id = "p1",
        content = "Texte",
        media = listOf(media("a", "Premiere"), media("b", null)),
        createdAt = "2026-07-18T10:00:00Z",
        author = ApiAuthor(id = "u1", displayName = "Ada"),
    )
    private val comments = listOf(
        ApiPostComment(id = "c1", content = "Vu", media = listOf(media("m", null)), createdAt = "2026-07-19T10:00:00Z", author = ApiAuthor(id = "u2", displayName = "Bob")),
    )

    private val feedPost = FeedPostPresentation(
        id = "p1", authorId = "u1", authorUsername = null, authorName = "Ada", authorAvatarUrl = null,
        createdAtIso = "2026-07-18T10:00:00Z", content = "Texte", isTranslated = false, languageStrip = emptyList(), moodEmoji = null,
        images = listOf(
            FeedPostImage(id = "a", url = "https://m/a.jpg", thumbnailUrl = "https://m/a-t.jpg", width = null, height = null, thumbHash = null, caption = "Premiere"),
            FeedPostImage(id = "b", url = "https://m/b.jpg", thumbnailUrl = "https://m/b-t.jpg", width = null, height = null, thumbHash = null, caption = null),
        ),
        likeCount = 0, isLiked = false, bookmarkCount = 0, isBookmarked = false, commentCount = 1, repostCount = 0,
        isPinned = false, isEdited = false, isReel = false, repostEmbed = null, viewCount = 0, impressionCount = 0, isAuthor = false,
    )

    @Test
    fun `la galerie du fil porte les memes pages, legendes et auteurs que la composition commune`() {
        val common = SocialMediaGalleryPresentation.compose(apiPost, comments, Prefs)
        val viaFeed = FeedMediaGallery.social(FeedMediaGallery.of(feedPost, imageIndex = 1), comments, Prefs)
        assertThat(viaFeed.pages.map { it.id }).isEqualTo(common.pages.map { it.id })
        assertThat(viaFeed.pages.map { it.kind }).isEqualTo(common.pages.map { it.kind })
        assertThat(viaFeed.pages.map { it.caption }).isEqualTo(common.pages.map { it.caption })
        assertThat(viaFeed.pages.map { it.attribution.name }).isEqualTo(common.pages.map { it.attribution.name })
        assertThat(viaFeed.pages.map { it.postMediaId }).isEqualTo(common.pages.map { it.postMediaId })
    }

    @Test
    fun `la page d'entree du fil est l'image touchee`() {
        val gallery = FeedMediaGallery.of(feedPost, imageIndex = 1)
        val social = FeedMediaGallery.social(gallery, comments, Prefs)
        assertThat(social.entryIndex("b", 0)).isEqualTo(gallery.startIndex)
    }
}
