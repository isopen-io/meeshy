package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMediaCaptionTranslationEntry
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MAX_POST_MEDIA
import org.junit.Test

class FeedPostBuilderMediaTypesTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun build(vararg media: ApiPostMedia, prefs: Prefs = Prefs(), base: String? = "https://gate.meeshy.me/") =
        FeedPostBuilder.build(
            ApiPost(id = "p1", content = "x", originalLanguage = "fr", media = media.toList()),
            prefs,
            mediaBaseUrl = base,
        )

    private fun media(id: String, mime: String?, order: Int? = null, url: String? = "/uploads/$id") =
        ApiPostMedia(id = id, mimeType = mime, fileUrl = url, order = order)

    @Test
    fun `les quatre types de media sont conserves dans l ordre du serveur`() {
        val result = build(
            media("d", "application/pdf", order = 3),
            media("a", "audio/mpeg", order = 2),
            media("v", "video/mp4", order = 1),
            media("i", "image/jpeg", order = 0),
        )

        assertThat(result.media.map { it.type }).containsExactly(
            FeedMediaType.IMAGE, FeedMediaType.VIDEO, FeedMediaType.AUDIO, FeedMediaType.DOCUMENT,
        ).inOrder()
        assertThat(result.images.map { it.id }).containsExactly("i")
    }

    @Test
    fun `un mime absent retombe sur l image`() {
        assertThat(build(media("x", null)).media.single().type).isEqualTo(FeedMediaType.IMAGE)
    }

    @Test
    fun `un media sans url est ecarte`() {
        assertThat(build(media("x", "image/png", url = null), media("y", "image/png", url = " ")).media).isEmpty()
    }

    @Test
    fun `url, vignette, thumbHash, teinte, ratio et duree sont portes`() {
        val item = build(
            ApiPostMedia(
                id = "v", mimeType = "video/mp4", fileUrl = "/v.mp4", thumbnailUrl = "/v.jpg",
                thumbHash = "hash", width = 1920, height = 1080, duration = 125_000,
            ),
        ).media.single()

        assertThat(item.url).isEqualTo("https://gate.meeshy.me/v.mp4")
        assertThat(item.thumbnailUrl).isEqualTo("https://gate.meeshy.me/v.jpg")
        assertThat(item.thumbHash).isEqualTo("hash")
        assertThat(item.thumbnailColor).isEqualTo("FF6B6B")
        assertThat(item.aspectRatio).isWithin(1e-9).of(1920.0 / 1080.0)
        assertThat(item.durationSeconds).isEqualTo(125)
        assertThat(item.durationLabel).isEqualTo("2:05")
    }

    @Test
    fun `un document porte son nom et sa taille lisible`() {
        val item = build(
            ApiPostMedia(id = "d", mimeType = "application/pdf", fileUrl = "/d.pdf", originalName = "plan.pdf", fileName = "x.pdf", fileSize = 1_572_864),
        ).media.single()

        assertThat(item.fileName).isEqualTo("plan.pdf")
        assertThat(item.fileSizeLabel).isEqualTo("1.5 MB")
        assertThat(item.thumbnailColor).isEqualTo("F39C12")
    }

    @Test
    fun `les tailles sous le Mo sont en octets ou en Ko`() {
        assertThat(FeedMediaMapper.fileSizeLabel(512)).isEqualTo("512 B")
        assertThat(FeedMediaMapper.fileSizeLabel(2048)).isEqualTo("2.0 KB")
    }

    @Test
    fun `un audio garde sa transcription et ses pistes traduites`() {
        val item = build(
            ApiPostMedia(
                id = "a", mimeType = "audio/mpeg", fileUrl = "/a.mp3",
                transcription = ApiAttachmentTranscription(text = "salut", language = "fr"),
                translations = mapOf(
                    "en" to ApiAttachmentTranslation(url = "/a_en.mp3", transcription = "hi", durationMs = 900),
                    "es" to ApiAttachmentTranslation(url = "", transcription = "hola"),
                ),
            ),
        ).media.single()

        assertThat(item.transcription?.text).isEqualTo("salut")
        assertThat(item.translatedAudios.map { it.targetLanguage }).containsExactly("en")
        assertThat(item.translatedAudios.single().url).isEqualTo("https://gate.meeshy.me/a_en.mp3")
        assertThat(item.translatedAudios.single().transcription).isEqualTo("hi")
    }

    @Test
    fun `la legende suit le Prisme sur un rang autre que le premier`() {
        val caption = ApiPostMedia(
            id = "i", mimeType = "image/jpeg", fileUrl = "/i.jpg", caption = "Bonjour", captionLanguage = "fr",
            captionTranslations = mapOf("en" to ApiMediaCaptionTranslationEntry(text = "Hello")),
        )

        assertThat(build(caption, prefs = Prefs(systemLanguage = "de", regionalLanguage = "en")).media.single().caption)
            .isEqualTo("Hello")
    }

    @Test
    fun `la langue d origine concourt a son rang`() {
        val caption = ApiPostMedia(
            id = "i", mimeType = "image/jpeg", fileUrl = "/i.jpg", caption = "Bonjour", captionLanguage = "fr",
            captionTranslations = mapOf("en" to ApiMediaCaptionTranslationEntry(text = "Hello")),
        )

        assertThat(build(caption, prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en")).media.single().caption)
            .isEqualTo("Bonjour")
    }

    @Test
    fun `le texte alternatif de l auteur sert de description, sinon la legende servie`() {
        val withAlt = build(ApiPostMedia(id = "i", mimeType = "image/png", fileUrl = "/i", alt = " Un vélo ", caption = "Légende")).media.single()
        val withoutAlt = build(ApiPostMedia(id = "i", mimeType = "image/png", fileUrl = "/i", alt = "  ", caption = "Légende")).media.single()
        val neither = build(ApiPostMedia(id = "i", mimeType = "image/png", fileUrl = "/i")).media.single()

        assertThat(withAlt.accessibilityDescription).isEqualTo("Un vélo")
        assertThat(withoutAlt.accessibilityDescription).isEqualTo("Légende")
        assertThat(neither.accessibilityDescription).isNull()
    }

    @Test
    fun `le plafond de medias est applique aux modeles`() {
        val many = (0 until MAX_POST_MEDIA + 5).map { media("m$it", "image/png", order = it) }.toTypedArray()

        val result = build(*many)

        assertThat(result.media).hasSize(MAX_POST_MEDIA)
        assertThat(result.media.last().id).isEqualTo("m${MAX_POST_MEDIA - 1}")
    }

    @Test
    fun `la hauteur de carte suit le cadrage par ratio`() {
        val item = build(ApiPostMedia(id = "i", mimeType = "image/png", fileUrl = "/i", width = 1080, height = 1920)).media.single()

        assertThat(item.fittedHeight(cardWidth = 360f)).isEqualTo(504f)
    }

    @Test
    fun `un reel glisse en diapositives horizontales, un post en carrousel`() {
        val reel = FeedPostBuilder.build(ApiPost(id = "r", type = "REEL"), Prefs(), null)
        val post = FeedPostBuilder.build(ApiPost(id = "p"), Prefs(), null)

        assertThat(reel.mediaPresentation).isEqualTo(me.meeshy.sdk.model.PostMediaPresentation.HORIZONTAL_SLIDES)
        assertThat(post.mediaPresentation).isEqualTo(me.meeshy.sdk.model.PostMediaPresentation.CAROUSEL)
    }
}
