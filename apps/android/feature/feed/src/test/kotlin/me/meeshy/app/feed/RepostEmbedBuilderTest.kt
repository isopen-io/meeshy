package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class RepostEmbedBuilderTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun repost(
        id: String = "r1",
        type: String? = "POST",
        content: String? = "Bonjour",
        author: ApiAuthor? = ApiAuthor(id = "u9", username = "orig", displayName = "Origen", avatar = "/av/o.png"),
        translations: Map<String, ApiPostTranslationEntry>? = null,
        media: List<ApiPostMedia>? = null,
        isQuote: Boolean? = false,
        createdAt: String? = "2026-07-01T10:00:00Z",
        likeCount: Int? = null,
        moodEmoji: String? = null,
        location: SharedPlace? = null,
    ) = ApiRepostOf(
        id = id,
        type = type,
        content = content,
        originalLanguage = "fr",
        author = author,
        translations = translations,
        media = media,
        isQuote = isQuote,
        createdAt = createdAt,
        likeCount = likeCount,
        moodEmoji = moodEmoji,
        location = location,
    )

    // --- absence / presence ---

    @Test
    fun build_nullRepostYieldsNull() {
        assertThat(RepostEmbedBuilder.build(null, Prefs(), mediaBaseUrl = null)).isNull()
    }

    @Test
    fun build_tapTargetIsTheOriginalRepostedPostNotTheOuterCard() {
        val embed = RepostEmbedBuilder.build(repost(id = "original-42"), Prefs(), null)
        assertThat(embed?.id).isEqualTo("original-42")
    }

    // --- author ---

    @Test
    fun build_authorNamePrefersDisplayNameThenUsername() {
        assertThat(RepostEmbedBuilder.build(repost(), Prefs(), null)?.authorName).isEqualTo("Origen")
        val noDisplay = repost(author = ApiAuthor(id = "u9", username = "orig", displayName = null))
        assertThat(RepostEmbedBuilder.build(noDisplay, Prefs(), null)?.authorName).isEqualTo("orig")
        val anon = repost(author = null)
        assertThat(RepostEmbedBuilder.build(anon, Prefs(), null)?.authorName).isNull()
        val blank = repost(author = ApiAuthor(id = "u9", username = "  ", displayName = "  "))
        assertThat(RepostEmbedBuilder.build(blank, Prefs(), null)?.authorName).isNull()
    }

    @Test
    fun build_authorAvatarResolvedAgainstBaseUrl() {
        val embed = RepostEmbedBuilder.build(repost(), Prefs(), mediaBaseUrl = "https://gate.meeshy.me/")
        assertThat(embed?.authorAvatarUrl).isEqualTo("https://gate.meeshy.me/av/o.png")
    }

    // --- Prisme content ---

    @Test
    fun build_resolvesPrismeContentAndFlagsTranslation() {
        val r = repost(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val embed = RepostEmbedBuilder.build(r, Prefs(systemLanguage = "en"), null)
        assertThat(embed?.content).isEqualTo("Hello")
        assertThat(embed?.isTranslated).isTrue()
    }

    @Test
    fun build_keepsOriginalWhenNoPreferredTranslation() {
        val r = repost(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val embed = RepostEmbedBuilder.build(r, Prefs(systemLanguage = "de"), null)
        assertThat(embed?.content).isEqualTo("Bonjour")
        assertThat(embed?.isTranslated).isFalse()
    }

    @Test
    fun build_nullContentBecomesEmptyString() {
        val embed = RepostEmbedBuilder.build(repost(content = null), Prefs(), null)
        assertThat(embed?.content).isEqualTo("")
    }

    // --- media preview ---

    @Test
    fun build_previewUsesFirstMediaThumbnailAndCountsExtras() {
        val media = listOf(
            ApiPostMedia(id = "m1", mimeType = "image/jpeg", fileUrl = "/u/a.jpg", thumbnailUrl = "/u/a-t.jpg"),
            ApiPostMedia(id = "m2", mimeType = "image/png", fileUrl = "/u/b.png"),
            ApiPostMedia(id = "m3", mimeType = "video/mp4", fileUrl = "/u/c.mp4"),
        )
        val embed = RepostEmbedBuilder.build(repost(media = media), Prefs(), mediaBaseUrl = "https://cdn/")
        assertThat(embed?.previewImageUrl).isEqualTo("https://cdn/u/a-t.jpg")
        assertThat(embed?.extraMediaCount).isEqualTo(2)
    }

    @Test
    fun build_previewFallsBackToFileUrlWhenNoThumbnail() {
        val media = listOf(ApiPostMedia(id = "m1", mimeType = "image/png", fileUrl = "https://cdn/a.png"))
        val embed = RepostEmbedBuilder.build(repost(media = media), Prefs(), null)
        assertThat(embed?.previewImageUrl).isEqualTo("https://cdn/a.png")
        assertThat(embed?.extraMediaCount).isEqualTo(0)
    }

    @Test
    fun build_noMediaHasNullPreviewAndZeroExtras() {
        val embed = RepostEmbedBuilder.build(repost(media = null), Prefs(), null)
        assertThat(embed?.previewImageUrl).isNull()
        assertThat(embed?.extraMediaCount).isEqualTo(0)
    }

    @Test
    fun build_mediaWithoutAnyUrlHasNullPreview() {
        val media = listOf(ApiPostMedia(id = "m1", mimeType = "image/png", fileUrl = null, thumbnailUrl = null))
        val embed = RepostEmbedBuilder.build(repost(media = media), Prefs(), null)
        assertThat(embed?.previewImageUrl).isNull()
        // Still a media item on the reposted post, so the "+N" surplus counts it out (size-1 = 0).
        assertThat(embed?.extraMediaCount).isEqualTo(0)
    }

    // --- quote / kind flags ---

    @Test
    fun build_isQuoteReflectsFlag() {
        assertThat(RepostEmbedBuilder.build(repost(isQuote = true), Prefs(), null)?.isQuote).isTrue()
        assertThat(RepostEmbedBuilder.build(repost(isQuote = false), Prefs(), null)?.isQuote).isFalse()
        assertThat(RepostEmbedBuilder.build(repost(isQuote = null), Prefs(), null)?.isQuote).isFalse()
    }

    @Test
    fun build_detectsStoryAndReelKindCaseInsensitively() {
        assertThat(RepostEmbedBuilder.build(repost(type = "STORY"), Prefs(), null)?.isStory).isTrue()
        assertThat(RepostEmbedBuilder.build(repost(type = "story"), Prefs(), null)?.isStory).isTrue()
        assertThat(RepostEmbedBuilder.build(repost(type = "Reel"), Prefs(), null)?.isReel).isTrue()
        val plain = RepostEmbedBuilder.build(repost(type = "POST"), Prefs(), null)
        assertThat(plain?.isStory).isFalse()
        assertThat(plain?.isReel).isFalse()
    }

    @Test
    fun build_carriesCreatedAtIso() {
        val embed = RepostEmbedBuilder.build(repost(createdAt = "2026-07-01T10:00:00Z"), Prefs(), null)
        assertThat(embed?.createdAtIso).isEqualTo("2026-07-01T10:00:00Z")
    }

    // --- reposted post's like count (parity iOS FeedPostCard.repostView / PostDetailView.repostEmbed) ---

    @Test
    fun build_projectsRepostedPostLikeCount() {
        val embed = RepostEmbedBuilder.build(repost(likeCount = 7), Prefs(), null)
        assertThat(embed?.likeCount).isEqualTo(7)
    }

    @Test
    fun build_absentLikeCountBecomesZero() {
        val embed = RepostEmbedBuilder.build(repost(likeCount = null), Prefs(), null)
        assertThat(embed?.likeCount).isEqualTo(0)
    }

    @Test
    fun build_clampsNegativeLikeCountToZero() {
        val embed = RepostEmbedBuilder.build(repost(likeCount = -3), Prefs(), null)
        assertThat(embed?.likeCount).isEqualTo(0)
    }

    // --- reposted post's mood emoji (parity iOS FeedPostCard.swift:966 — a reposted
    //     STATUS carries an empty body, so without the emoji the embed shows nothing) ---

    @Test
    fun build_projectsRepostedPostMoodEmoji() {
        val embed = RepostEmbedBuilder.build(repost(moodEmoji = "🎉"), Prefs(), null)
        assertThat(embed?.moodEmoji).isEqualTo("🎉")
    }

    @Test
    fun build_absentMoodEmojiBecomesNull() {
        val embed = RepostEmbedBuilder.build(repost(moodEmoji = null), Prefs(), null)
        assertThat(embed?.moodEmoji).isNull()
    }

    @Test
    fun build_blankMoodEmojiBecomesNull() {
        val embed = RepostEmbedBuilder.build(repost(moodEmoji = "   "), Prefs(), null)
        assertThat(embed?.moodEmoji).isNull()
    }

    // --- reposted post's shared location (parity iOS FeedPostCard.swift:989 — the
    //     source post's SharedPlace rendered inside the quote embed). Projected
    //     through the same FeedPostLocationBuilder the outer card uses. ---

    @Test
    fun build_projectsRepostedPostLocation() {
        val r = repost(location = SharedPlace(latitude = 48.8584, longitude = 2.2945, name = "Tour Eiffel"))
        val embed = RepostEmbedBuilder.build(r, Prefs(), null)
        assertThat(embed?.location).isNotNull()
        assertThat(embed?.location?.label).isEqualTo("Tour Eiffel")
        assertThat(embed?.location?.latitude).isEqualTo(48.8584)
        assertThat(embed?.location?.longitude).isEqualTo(2.2945)
    }

    @Test
    fun build_absentLocationBecomesNull() {
        val embed = RepostEmbedBuilder.build(repost(location = null), Prefs(), null)
        assertThat(embed?.location).isNull()
    }

    @Test
    fun build_coordinateOnlyLocationStillProjectsWithNullLabel() {
        val r = repost(location = SharedPlace(latitude = 12.0, longitude = 34.0))
        val embed = RepostEmbedBuilder.build(r, Prefs(), null)
        assertThat(embed?.location).isNotNull()
        assertThat(embed?.location?.label).isNull()
        assertThat(embed?.location?.latitude).isEqualTo(12.0)
    }
}
