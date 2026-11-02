package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.Test

/** #14329 — « Imager » rend une oeuvre COMPOSÉE (iOS `PostSaveAction.imagerAction`) : un post ou un réel de médias simple n'a rien à rendre. */
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

    private fun imaged(post: ApiPost) = FeedPostBuilder.build(post, Prefs, mediaBaseUrl = "https://cdn.test").imagerScenes

    @Test
    fun `a composed reel renders its scene on the colour of its author`() {
        val scenes = requireNotNull(imaged(reel(listOf(audio), scene)))

        assertThat(scenes.items.map { it.id }).containsExactly("r1")
        assertThat(scenes.accentHex).isEqualTo(DynamicColorGenerator.colorForPost("u1", "REEL", null))
    }

    @Test
    fun `a composed reel whose card shows a video still has its scene to render`() {
        assertThat(imaged(reel(listOf(video), scene))?.items?.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `a reel of bare media and a reel with only a background have nothing to render`() {
        assertThat(imaged(reel(listOf(video)))).isNull()
        assertThat(imaged(reel(listOf(audio), StoryEffects(background = "FF0000")))).isNull()
    }

    @Test
    fun `a plain post has nothing to render`() {
        assertThat(imaged(ApiPost(id = "p", type = "POST", content = "texte"))).isNull()
    }

    @Test
    fun `a post at scene renders all its scenes in order`() {
        val scenes = FeedPostScenes(items = listOf(StoryItem(id = "a"), StoryItem(id = "b")), layout = MosaicLayoutMode.CAROUSEL, accentHex = "6366F1")

        val imaged = requireNotNull(PostImaging.of(scenes, composedReel = null, reelAccentHex = null))

        assertThat(imaged.items.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(imaged.accentHex).isEqualTo("6366F1")
    }
}
