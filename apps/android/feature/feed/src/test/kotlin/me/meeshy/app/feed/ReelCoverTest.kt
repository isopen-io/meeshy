package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

/** #13665 — un réel du fil montre sa couverture (vignette, scène au repos ou aplat), comme iOS ; jamais une boîte vide. */
class ReelCoverTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val video = ApiPostMedia(
        id = "v", mimeType = "video/mp4", fileUrl = "/u/v.mp4", thumbnailUrl = "/u/v.jpg", thumbHash = "HASH", width = 720, height = 1280,
    )
    private val audio = ApiPostMedia(id = "a", mimeType = "audio/mp4", fileUrl = "/u/a.m4a")
    private val image = ApiPostMedia(id = "i", mimeType = "image/jpeg", fileUrl = "/u/i.jpg", thumbHash = "IH")
    private val scene = StoryEffects(
        textObjects = listOf(StoryTextObject(id = "t", text = "Salut")),
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "a", isBackground = true)),
    )

    private fun post(media: List<ApiPostMedia>, effects: StoryEffects? = null) =
        ApiPost(id = "r1", type = "REEL", media = media, storyEffects = effects, author = ApiAuthor(id = "u1", username = "amina"))

    private fun cover(post: ApiPost) = FeedPostBuilder.build(post, Prefs, mediaBaseUrl = "https://cdn.test").reelCover

    @Test
    fun `une video montre sa vignette derriere son thumbHash`() {
        val cover = cover(post(listOf(video))) as ReelCover.Poster
        assertThat(cover.url).isEqualTo("https://cdn.test/u/v.jpg")
        assertThat(cover.thumbHash).isEqualTo("HASH")
        assertThat(cover.isVideo).isTrue()
    }

    @Test
    fun `une video sans vignette n affiche pas le fichier video comme une image`() {
        val cover = cover(post(listOf(video.copy(thumbnailUrl = null))))
        assertThat(cover).isEqualTo(ReelCover.Backdrop(isVideo = true))
    }

    @Test
    fun `un reel audio a couverture montre l image, un reel audio seul montre l aplat`() {
        assertThat((cover(post(listOf(audio, image))) as ReelCover.Poster).url).isEqualTo("https://cdn.test/u/i.jpg")
        assertThat(cover(post(listOf(audio)))).isEqualTo(ReelCover.Backdrop(isVideo = false))
    }

    @Test
    fun `un reel compose sans visuel se rejoue par sa scene`() {
        val cover = cover(post(listOf(audio), scene))
        assertThat(cover).isInstanceOf(ReelCover.Scene::class.java)
        assertThat((cover as ReelCover.Scene).item.id).isEqualTo("r1")
    }

    @Test
    fun `un fond seul n est pas une scene`() {
        assertThat(cover(post(listOf(audio), StoryEffects(background = "FF0000")))).isEqualTo(ReelCover.Backdrop(isVideo = false))
    }

    @Test
    fun `un visuel l emporte sur la scene et un post ordinaire n a pas de couverture`() {
        assertThat(cover(post(listOf(video), scene))).isInstanceOf(ReelCover.Poster::class.java)
        assertThat(FeedPostBuilder.build(ApiPost(id = "p", type = "POST"), Prefs, null).reelCover).isNull()
    }

    @Test
    fun `la carte suit le rapport du media dans les bornes 4 5 a 4 3`() {
        assertThat(ReelCoverResolver.cardAspect(720, 1280)).isEqualTo(0.8f)
        assertThat(ReelCoverResolver.cardAspect(1920, 1080)).isEqualTo(4f / 3f)
        assertThat(ReelCoverResolver.cardAspect(1000, 1000)).isEqualTo(1f)
        assertThat(ReelCoverResolver.cardAspect(null, null)).isEqualTo(0.8f)
    }

    @Test
    fun `le reel cite d un repost montre sa vignette, ou la scene que la republication sert`() {
        val source = ApiRepostOf(id = "orig", type = "REEL", media = listOf(video), author = ApiAuthor(id = "u9", username = "orig"))
        val withPoster = RepostEmbedBuilder.forPost(ApiPost(id = "outer", type = "POST", repostOf = source), Prefs, "https://cdn.test")
        assertThat((withPoster!!.reelCover as ReelCover.Poster).url).isEqualTo("https://cdn.test/u/v.jpg")

        val audioOnly = source.copy(media = listOf(audio), storyEffects = scene)
        val withScene = RepostEmbedBuilder.forPost(ApiPost(id = "outer", type = "POST", repostOf = audioOnly), Prefs, null)
        assertThat(withScene!!.reelCover).isInstanceOf(ReelCover.Scene::class.java)

        val bare = RepostEmbedBuilder.forPost(ApiPost(id = "outer", type = "POST", repostOf = source.copy(media = listOf(audio))), Prefs, null)
        assertThat(bare!!.reelCover).isEqualTo(ReelCover.Backdrop(isVideo = false))
    }

    @Test
    fun `un repost qui n est pas un reel n a pas de couverture`() {
        val plain = RepostEmbedBuilder.forPost(ApiPost(id = "o", type = "POST", repostOf = ApiRepostOf(id = "x", type = "POST")), Prefs, null)
        assertThat(plain!!.reelCover).isNull()
    }
}
