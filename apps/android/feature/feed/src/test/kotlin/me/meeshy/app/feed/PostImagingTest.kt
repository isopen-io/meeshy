package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.card.PostCommentCardMediaKind
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.Test

class PostImagingTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val video = ApiPostMedia(id = "v", mimeType = "video/mp4", fileUrl = "/u/v.mp4", thumbnailUrl = "/u/v.jpg", width = 720, height = 1280)
    private val audio = ApiPostMedia(id = "a", mimeType = "audio/mp4", fileUrl = "/u/a.m4a")
    private val scene = StoryEffects(
        textObjects = listOf(StoryTextObject(id = "t", text = "Salut")),
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "a", isBackground = true)),
    )

    private fun reel(media: List<ApiPostMedia>, effects: StoryEffects? = null) =
        ApiPost(id = "r1", type = "REEL", media = media, storyEffects = effects, author = ApiAuthor(id = "u1", username = "amina"))

    private fun imaged(post: ApiPost, prefs: LanguageResolver.ContentLanguagePreferences = Prefs) =
        FeedPostBuilder.build(post, prefs, mediaBaseUrl = "https://cdn.test").imager

    @Test
    fun `a composed reel renders its scene on the colour of its author, into the card workshop`() {
        val request = requireNotNull(imaged(reel(listOf(audio), scene)))

        assertThat(request.key).isEqualTo("post:r1")
        assertThat(request.scenes?.items?.map { it.id }).containsExactly("r1")
        assertThat(request.scenes?.accentHex).isEqualTo(DynamicColorGenerator.colorForPost("u1", "REEL", null))
        assertThat(request.card.reply.author).isEqualTo("amina")
        assertThat(request.card.media).isEmpty()
    }

    @Test
    fun `a composed reel whose card shows a video still renders its scene`() {
        assertThat(imaged(reel(listOf(video), scene))?.scenes?.items?.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `a reel of bare media images as a card of its video`() {
        val request = requireNotNull(imaged(reel(listOf(video))))

        assertThat(request.scenes).isNull()
        assertThat(request.card.media.map { it.media.kind }).containsExactly(PostCommentCardMediaKind.VIDEO)
    }

    @Test
    fun `a reel with only a background images as a card of its sound`() {
        val request = requireNotNull(imaged(reel(listOf(audio), StoryEffects(background = "FF0000"))))

        assertThat(request.scenes).isNull()
        assertThat(request.card.media.map { it.media.kind }).containsExactly(PostCommentCardMediaKind.AUDIO)
    }

    @Test
    fun `a plain text post images as a card of its text`() {
        val request = requireNotNull(imaged(ApiPost(id = "p", type = "POST", content = "texte", author = ApiAuthor(id = "u1", username = "amina"))))

        assertThat(request.scenes).isNull()
        assertThat(request.card.reply.text).isEqualTo("texte")
    }

    @Test
    fun `an ephemeral post or an empty post images nothing`() {
        assertThat(imaged(ApiPost(id = "p", type = "POST", content = "bientôt", expiresAt = "2030-01-01T00:00:00Z"))).isNull()
        assertThat(imaged(ApiPost(id = "p", type = "POST", content = "  "))).isNull()
    }

    @Test
    fun `a post whose original language is not at rank 1 images in the served language`() {
        val prefs = object : LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage: String? = "es"
            override val regionalLanguage: String? = "fr"
            override val customDestinationLanguage: String? = null
        }
        val post = ApiPost(
            id = "p",
            type = "POST",
            content = "Hello",
            originalLanguage = "en",
            translations = mapOf("de" to ApiPostTranslationEntry("Hallo"), "fr" to ApiPostTranslationEntry("Bonjour")),
        )

        assertThat(imaged(post, prefs)?.card?.reply?.text).isEqualTo("Bonjour")
    }

    @Test
    fun `a post at scene renders all its scenes in order`() {
        val scenes = FeedPostScenes(items = listOf(StoryItem(id = "a"), StoryItem(id = "b")), layout = MosaicLayoutMode.CAROUSEL, accentHex = "6366F1")

        val imaged = requireNotNull(PostImaging.scenesOf(scenes, composedReel = null, reelAccentHex = null))

        assertThat(imaged.items.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(imaged.accentHex).isEqualTo("6366F1")
    }
}
