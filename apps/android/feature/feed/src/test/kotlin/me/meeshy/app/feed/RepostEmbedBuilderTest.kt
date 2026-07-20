package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiRepostOf
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
}
