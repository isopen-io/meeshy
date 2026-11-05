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

    // --- #13654 : l'incrustation d'un post du fil ---

    private fun outer(
        repostOf: ApiRepostOf? = null,
        originalRepostOfId: String? = null,
        isQuote: Boolean? = null,
    ) = me.meeshy.sdk.model.ApiPost(
        id = "outer",
        type = "POST",
        repostOf = repostOf,
        originalRepostOfId = originalRepostOfId,
        isQuote = isQuote,
    )

    @Test
    fun forPost_aPlainPostHasNoEmbed() {
        assertThat(RepostEmbedBuilder.forPost(outer(), Prefs(), null)).isNull()
    }

    @Test
    fun forPost_aRepostCarriesTheOriginalAuthorHandleForTheHeaderAttribution() {
        val embed = RepostEmbedBuilder.forPost(outer(repostOf = repost()), Prefs(), null)
        assertThat(embed?.authorUsername).isEqualTo("orig")
        assertThat(embed?.isUnavailable).isFalse()
        assertThat(embed?.storyItem).isNull()
    }

    @Test
    fun forPost_aStoryRepostCarriesTheStoryForTheSceneReader() {
        val embed = RepostEmbedBuilder.forPost(outer(repostOf = repost(type = "STORY")), Prefs(), null)
        assertThat(embed?.isStory).isTrue()
        assertThat(embed?.storyItem?.repostOfId).isEqualTo("r1")
    }

    @Test
    fun forPost_aRepostWhoseOriginalIsNoLongerServedIsADrawnState() {
        val embed = RepostEmbedBuilder.forPost(outer(originalRepostOfId = "gone-1"), Prefs(), null)
        assertThat(embed?.isUnavailable).isTrue()
        assertThat(embed?.id).isEqualTo("gone-1")
        assertThat(embed?.content).isEmpty()
    }

    @Test
    fun forPost_aQuoteWhoseOriginalIsNoLongerServedIsADrawnStateToo() {
        val embed = RepostEmbedBuilder.forPost(outer(isQuote = true), Prefs(), null)
        assertThat(embed?.isUnavailable).isTrue()
        assertThat(embed?.isQuote).isTrue()
    }

    @Test
    fun the_header_attribution_names_the_original_author_and_stays_silent_when_it_is_gone() {
        val served = feedPostPresentation().copy(repostEmbed = RepostEmbedBuilder.forPost(outer(repostOf = repost()), Prefs(), null))
        assertThat(served.repostAttribution).isEqualTo("orig")
        val gone = feedPostPresentation().copy(repostEmbed = RepostEmbedBuilder.forPost(outer(originalRepostOfId = "x"), Prefs(), null))
        assertThat(gone.repostAttribution).isNull()
        assertThat(feedPostPresentation().repostAttribution).isNull()
    }

    // --- état de langue propre au post cité, likes, +N, expiration ---

    @Test
    fun build_citedPostCarriesItsOwnLanguageStateFromThePrism() {
        val translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello"), "es" to ApiPostTranslationEntry(text = "Hola"))
        val embed = RepostEmbedBuilder.build(repost(translations = translations), Prefs(systemLanguage = "pt", regionalLanguage = "es"), null)!!
        assertThat(embed.displayedLanguage).isEqualTo("es")
        assertThat(embed.content).isEqualTo("Hola")
        assertThat(embed.languageFlags.map { it.code }).containsExactly("fr", "en").inOrder()
        assertThat(embed.languageTexts).containsEntry("en", "Hello")
        assertThat(embed.languageTexts).containsEntry("fr", "Bonjour")
    }

    @Test
    fun build_noTranslationMeansTheOriginalLanguageIsReadAndNoFlagRepeatsIt() {
        val embed = RepostEmbedBuilder.build(repost(), Prefs(systemLanguage = "fr"), null)!!
        assertThat(embed.displayedLanguage).isEqualTo("fr")
        assertThat(embed.languageFlags).isEmpty()
    }

    @Test
    fun build_likesAreClampedAndExtraMediaCountsAfterTheFirst() {
        val media = List(4) { ApiPostMedia(id = "m$it", mimeType = "image/png", fileUrl = "/u/$it.png") }
        val embed = RepostEmbedBuilder.build(repost(media = media, likeCount = -3), Prefs(), null)!!
        assertThat(embed.likeCount).isEqualTo(0)
        assertThat(embed.extraMediaCount).isEqualTo(3)
        assertThat(RepostEmbedBuilder.build(repost(likeCount = 12), Prefs(), null)?.likeCount).isEqualTo(12)
    }

    @Test
    fun build_coversAudioMentionsExpiryAndOriginalRepost() {
        val source = repost().copy(
            audioUrl = "/u/voice.m4a",
            mentions = listOf(me.meeshy.sdk.model.PostReference(userId = "u1", username = "Alice")),
            expiresAt = "2999-01-01T00:00:00Z",
            originalRepostOfId = "root-1",
        )
        val embed = RepostEmbedBuilder.build(source, Prefs(), mediaBaseUrl = "https://cdn/")!!
        assertThat(embed.audioUrl).isEqualTo("https://cdn/u/voice.m4a")
        assertThat(embed.mentionUsernames).containsExactly("alice")
        assertThat(embed.expiresAtIso).isEqualTo("2999-01-01T00:00:00Z")
        assertThat(embed.originalRepostOfId).isEqualTo("root-1")
        assertThat(embed.isUnavailable).isFalse()
    }

    @Test
    fun build_anExpiredNonStoryIsADrawnUnavailableStateButAStoryKeepsItsOwnLifecycle() {
        val now = 1_800_000_000_000L
        val expired = repost().copy(expiresAt = "2020-01-01T00:00:00Z")
        assertThat(RepostEmbedBuilder.build(expired, Prefs(), null, nowEpochMillis = now)?.isUnavailable).isTrue()
        val story = repost(type = "STORY").copy(expiresAt = "2020-01-01T00:00:00Z")
        assertThat(RepostEmbedBuilder.build(story, Prefs(), null, nowEpochMillis = now)?.isUnavailable).isFalse()
    }

    @Test
    fun reelStrip_prefersVideoThenAudioAndAutoplayKeyIsTheContainingPost() {
        val video = RepostEmbedBuilder.build(
            repost(type = "REEL", media = listOf(ApiPostMedia(id = "a", mimeType = "audio/mpeg", fileUrl = "/a.mp3"), ApiPostMedia(id = "v", mimeType = "video/mp4", fileUrl = "/v.mp4"))),
            Prefs(), null,
        )!!
        assertThat(video.reelStripKind()).isEqualTo(me.meeshy.sdk.model.FeedReelKind.VIDEO)
        assertThat(video.reelStripVideo()?.id).isEqualTo("v")
        val audio = RepostEmbedBuilder.build(repost(type = "REEL", media = listOf(ApiPostMedia(id = "a", mimeType = "audio/mpeg", fileUrl = "/a.mp3"))), Prefs(), null)!!
        assertThat(audio.reelStripKind()).isEqualTo(me.meeshy.sdk.model.FeedReelKind.AUDIO)
        assertThat(audio.reelStripVideo()).isNull()
        assertThat(RepostEmbedAutoplayKey.of("outer-9")).isEqualTo("outer-9")
    }
}
