package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

class FeedPostBuilderTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun post(
        content: String? = "Bonjour",
        author: ApiAuthor? = ApiAuthor(id = "u1", username = "alice", displayName = "Alice"),
        likeCount: Int? = 3,
        isLikedByMe: Boolean? = false,
        commentCount: Int? = 2,
        repostCount: Int? = 1,
        media: List<ApiPostMedia>? = null,
        translations: Map<String, ApiPostTranslationEntry>? = null,
        moodEmoji: String? = null,
    ) = ApiPost(
        id = "p1",
        content = content,
        author = author,
        likeCount = likeCount,
        isLikedByMe = isLikedByMe,
        commentCount = commentCount,
        repostCount = repostCount,
        media = media,
        translations = translations,
        moodEmoji = moodEmoji,
        originalLanguage = "fr",
    )

    @Test
    fun build_resolvesPrismeContentAndTranslationFlag() {
        val p = post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val result = FeedPostBuilder.build(p, Prefs(systemLanguage = "en"), mediaBaseUrl = null)
        assertThat(result.content).isEqualTo("Hello")
        assertThat(result.isTranslated).isTrue()
    }

    @Test
    fun build_keepsOriginalWhenNoPreferredTranslation() {
        val p = post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val result = FeedPostBuilder.build(p, Prefs(systemLanguage = "de"), mediaBaseUrl = null)
        assertThat(result.content).isEqualTo("Bonjour")
        assertThat(result.isTranslated).isFalse()
    }

    @Test
    fun build_translatedPostCarriesLanguageStripAnchoringOriginalAndPreferred() {
        val p = post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val result = FeedPostBuilder.build(p, Prefs(systemLanguage = "en"), mediaBaseUrl = null)
        assertThat(result.isTranslated).isTrue()
        assertThat(result.languageStrip.map { it.code }).containsExactly("fr", "en").inOrder()
        assertThat(result.languageStrip.first { it.code == "fr" }.isOriginal).isTrue()
        assertThat(result.languageStrip.first { it.code == "en" }.isActive).isTrue()
    }

    @Test
    fun build_untranslatedPostHasEmptyLanguageStrip() {
        // No preferred-language translation → Prisme shows the original → no strip to explore.
        val p = post(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")))
        val result = FeedPostBuilder.build(p, Prefs(systemLanguage = "de"), mediaBaseUrl = null)
        assertThat(result.isTranslated).isFalse()
        assertThat(result.languageStrip).isEmpty()
    }

    @Test
    fun build_likeStateComesFromIsLikedByMeNotCount() {
        // A post liked by others (count 3) but not by me must NOT show as liked.
        val p = post(likeCount = 3, isLikedByMe = false)
        assertThat(FeedPostBuilder.build(p, Prefs(), null).isLiked).isFalse()
        assertThat(FeedPostBuilder.build(p, Prefs(), null).likeCount).isEqualTo(3)

        val mine = post(likeCount = 1, isLikedByMe = true)
        assertThat(FeedPostBuilder.build(mine, Prefs(), null).isLiked).isTrue()
    }

    @Test
    fun build_authorNamePrefersDisplayNameThenUsername() {
        assertThat(FeedPostBuilder.build(post(), Prefs(), null).authorName).isEqualTo("Alice")
        val noDisplay = post(author = ApiAuthor(id = "u1", username = "bob", displayName = null))
        assertThat(FeedPostBuilder.build(noDisplay, Prefs(), null).authorName).isEqualTo("bob")
        val anon = post(author = null)
        assertThat(FeedPostBuilder.build(anon, Prefs(), null).authorName).isNull()
    }

    @Test
    fun build_filtersToImageMediaAndResolvesRelativeUrls() {
        val media = listOf(
            ApiPostMedia(id = "m1", mimeType = "image/jpeg", fileUrl = "/uploads/a.jpg", order = 1),
            ApiPostMedia(id = "m2", mimeType = "video/mp4", fileUrl = "/uploads/b.mp4", order = 2),
            ApiPostMedia(id = "m3", mimeType = "image/png", fileUrl = "https://cdn/c.png", order = 0),
        )
        val result = FeedPostBuilder.build(post(media = media), Prefs(), mediaBaseUrl = "https://gate.meeshy.me/")
        // images only, ordered by `order`, relative resolved, absolute kept.
        assertThat(result.images.map { it.url }).containsExactly(
            "https://cdn/c.png",
            "https://gate.meeshy.me/uploads/a.jpg",
        ).inOrder()
    }

    @Test
    fun build_carriesCountsAndMood() {
        val result = FeedPostBuilder.build(post(moodEmoji = "🔥"), Prefs(), null)
        assertThat(result.commentCount).isEqualTo(2)
        assertThat(result.repostCount).isEqualTo(1)
        assertThat(result.moodEmoji).isEqualTo("🔥")
    }

    @Test
    fun build_nullCountsBecomeZero() {
        val p = post(likeCount = null, commentCount = null, repostCount = null)
        val result = FeedPostBuilder.build(p, Prefs(), null)
        assertThat(result.likeCount).isEqualTo(0)
        assertThat(result.commentCount).isEqualTo(0)
        assertThat(result.repostCount).isEqualTo(0)
    }

    // --- Prisme language switch (per-post active-language override) ---

    private fun bilingualPost() = post(
        translations = mapOf(
            "en" to ApiPostTranslationEntry(text = "Hello"),
            "es" to ApiPostTranslationEntry(text = "Hola"),
        ),
    )

    // System=en, regional=es → default resolution picks en (first configured with
    // content); both en and es are configured content languages carried by the post.
    private val bilingualPrefs = Prefs(systemLanguage = "en", regionalLanguage = "es")

    @Test
    fun build_nullOverrideUsesDefaultPrismeResolution() {
        val result = FeedPostBuilder.build(bilingualPost(), bilingualPrefs, null, activeLanguageCode = null)
        assertThat(result.content).isEqualTo("Hello")
        assertThat(result.languageStrip.first { it.code == "en" }.isActive).isTrue()
        assertThat(result.languageStrip.first { it.code == "es" }.isActive).isFalse()
    }

    @Test
    fun build_overrideSwitchesContentAndStripToAnotherConfiguredLanguage() {
        val result = FeedPostBuilder.build(bilingualPost(), bilingualPrefs, null, activeLanguageCode = "es")
        assertThat(result.content).isEqualTo("Hola")
        assertThat(result.languageStrip.first { it.code == "es" }.isActive).isTrue()
        assertThat(result.languageStrip.first { it.code == "en" }.isActive).isFalse()
    }

    @Test
    fun build_overrideToOriginalShowsOriginalAndHighlightsOriginalChip() {
        val result = FeedPostBuilder.build(bilingualPost(), bilingualPrefs, null, activeLanguageCode = "fr")
        assertThat(result.content).isEqualTo("Bonjour")
        val original = result.languageStrip.first { it.code == "fr" }
        assertThat(original.isOriginal).isTrue()
        assertThat(original.isActive).isTrue()
        assertThat(result.languageStrip.first { it.code == "en" }.isActive).isFalse()
    }

    @Test
    fun build_overrideToLanguageWithoutContentFallsBackToDefault() {
        // "de" has no translation and is not configured → override ignored, default stands.
        val result = FeedPostBuilder.build(bilingualPost(), bilingualPrefs, null, activeLanguageCode = "de")
        assertThat(result.content).isEqualTo("Hello")
        assertThat(result.languageStrip.first { it.code == "en" }.isActive).isTrue()
    }

    @Test
    fun build_overrideMatchesCaseInsensitivelyAndTrims() {
        val result = FeedPostBuilder.build(bilingualPost(), bilingualPrefs, null, activeLanguageCode = "  ES ")
        assertThat(result.content).isEqualTo("Hola")
        assertThat(result.languageStrip.first { it.code == "es" }.isActive).isTrue()
    }

    @Test
    fun resolveActiveCode_overrideWithContentWins() {
        val code = FeedPostBuilder.resolveActiveCode(bilingualPost(), bilingualPrefs, override = "es")
        assertThat(code).isEqualTo("es")
    }

    @Test
    fun resolveActiveCode_overrideWithoutContentFallsBackToPreferred() {
        val code = FeedPostBuilder.resolveActiveCode(bilingualPost(), bilingualPrefs, override = "de")
        assertThat(code).isEqualTo("en")
    }

    @Test
    fun resolveActiveCode_nullOverrideFallsBackToPreferred() {
        val code = FeedPostBuilder.resolveActiveCode(bilingualPost(), bilingualPrefs, override = null)
        assertThat(code).isEqualTo("en")
    }

    @Test
    fun resolveActiveCode_nullOverrideWithNoPreferredTranslationFallsBackToOriginal() {
        // Prefs target a language the post does not carry → no preferred translation.
        val code = FeedPostBuilder.resolveActiveCode(bilingualPost(), Prefs(systemLanguage = "de"), override = null)
        assertThat(code).isEqualTo("fr")
    }
}
