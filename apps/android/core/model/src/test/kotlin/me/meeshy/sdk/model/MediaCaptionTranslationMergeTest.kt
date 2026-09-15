package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Mirror of `PostTranslationMergeTest` — the media-caption push-side merge (#6280). */
class MediaCaptionTranslationMergeTest {

    private fun media(id: String, captionTranslations: Map<String, ApiMediaCaptionTranslationEntry>? = null) =
        ApiPostMedia(id = id, caption = "Bonjour", captionLanguage = "fr", captionTranslations = captionTranslations)

    private fun postWithMedia(vararg media: ApiPostMedia) =
        ApiPost(id = "p1", content = "post text", media = media.toList())

    @Test
    fun `merges a new language into the targeted media`() {
        val post = postWithMedia(media("m1"))
        val entry = ApiMediaCaptionTranslationEntry(text = "Hello")
        val merged = MediaCaptionTranslationMerge.merge(post, "m1", commentId = null, language = "en", entry = entry)
        assertThat(merged).isNotNull()
        assertThat(merged!!.media!!.first { it.id == "m1" }.captionTranslations).containsEntry("en", entry)
    }

    @Test
    fun `preserves other media untouched`() {
        val post = postWithMedia(media("m1"), media("m2"))
        val entry = ApiMediaCaptionTranslationEntry(text = "Hello")
        val merged = MediaCaptionTranslationMerge.merge(post, "m1", commentId = null, language = "en", entry = entry)
        assertThat(merged!!.media!!.first { it.id == "m2" }.captionTranslations).isNull()
    }

    @Test
    fun `replaces an existing language match case-insensitively`() {
        val post = postWithMedia(media("m1", captionTranslations = mapOf("EN" to ApiMediaCaptionTranslationEntry(text = "old"))))
        val entry = ApiMediaCaptionTranslationEntry(text = "new")
        val merged = MediaCaptionTranslationMerge.merge(post, "m1", commentId = null, language = "en", entry = entry)
        val translations = merged!!.media!!.first().captionTranslations!!
        assertThat(translations).hasSize(1)
        assertThat(translations["EN"]).isEqualTo(entry)
    }

    @Test
    fun `no-op when the media id is unknown`() {
        val post = postWithMedia(media("m1"))
        val merged = MediaCaptionTranslationMerge.merge(
            post, "unknown", commentId = null, language = "en", entry = ApiMediaCaptionTranslationEntry(text = "Hello"),
        )
        assertThat(merged).isNull()
    }

    @Test
    fun `no-op when commentId is set — comment media isn't modeled on Android yet`() {
        val post = postWithMedia(media("m1"))
        val merged = MediaCaptionTranslationMerge.merge(
            post, "m1", commentId = "c1", language = "en", entry = ApiMediaCaptionTranslationEntry(text = "Hello"),
        )
        assertThat(merged).isNull()
    }

    @Test
    fun `no-op when the language is blank`() {
        val post = postWithMedia(media("m1"))
        val merged = MediaCaptionTranslationMerge.merge(
            post, "m1", commentId = null, language = "  ", entry = ApiMediaCaptionTranslationEntry(text = "Hello"),
        )
        assertThat(merged).isNull()
    }

    @Test
    fun `no-op when the translation text is blank`() {
        val post = postWithMedia(media("m1"))
        val merged = MediaCaptionTranslationMerge.merge(
            post, "m1", commentId = null, language = "en", entry = ApiMediaCaptionTranslationEntry(text = "   "),
        )
        assertThat(merged).isNull()
    }

    @Test
    fun `no-op when the identical entry is already present`() {
        val entry = ApiMediaCaptionTranslationEntry(text = "Hello", translationModel = "nllb")
        val post = postWithMedia(media("m1", captionTranslations = mapOf("en" to entry)))
        val merged = MediaCaptionTranslationMerge.merge(post, "m1", commentId = null, language = "en", entry = entry)
        assertThat(merged).isNull()
    }

    @Test
    fun `a metadata-only change is not a no-op`() {
        val original = ApiMediaCaptionTranslationEntry(text = "Hello", confidenceScore = 0.5)
        val richer = ApiMediaCaptionTranslationEntry(text = "Hello", confidenceScore = 0.99)
        val post = postWithMedia(media("m1", captionTranslations = mapOf("en" to original)))
        val merged = MediaCaptionTranslationMerge.merge(post, "m1", commentId = null, language = "en", entry = richer)
        assertThat(merged!!.media!!.first().captionTranslations!!["en"]).isEqualTo(richer)
    }

    @Test
    fun `no-op when the post has no media`() {
        val post = ApiPost(id = "p1", content = "text", media = null)
        val merged = MediaCaptionTranslationMerge.merge(
            post, "m1", commentId = null, language = "en", entry = ApiMediaCaptionTranslationEntry(text = "Hello"),
        )
        assertThat(merged).isNull()
    }
}
