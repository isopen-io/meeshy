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
import me.meeshy.sdk.theme.DynamicColorGenerator
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

    private val authorAccent = DynamicColorGenerator.colorForPost("u1", "REEL", null)

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
        assertThat(cover).isEqualTo(ReelCover.Backdrop(isVideo = true, accentHex = authorAccent))
    }

    @Test
    fun `un reel audio a couverture montre l image, un reel audio seul montre l aplat`() {
        assertThat((cover(post(listOf(audio, image))) as ReelCover.Poster).url).isEqualTo("https://cdn.test/u/i.jpg")
        assertThat(cover(post(listOf(audio)))).isEqualTo(ReelCover.Backdrop(isVideo = false, accentHex = authorAccent))
    }

    @Test
    fun `un reel compose sans visuel se rejoue par sa scene`() {
        val cover = cover(post(listOf(audio), scene))
        assertThat(cover).isInstanceOf(ReelCover.Scene::class.java)
        assertThat((cover as ReelCover.Scene).item.id).isEqualTo("r1")
        assertThat(cover.accentHex).isEqualTo(authorAccent)
    }

    @Test
    fun `un fond seul n est pas une scene`() {
        assertThat(cover(post(listOf(audio), StoryEffects(background = "FF0000")))).isEqualTo(ReelCover.Backdrop(isVideo = false, accentHex = authorAccent))
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
    fun `le reel cite d un repost montre sa vignette, ou l aplat de la couleur de son auteur`() {
        val source = ApiRepostOf(id = "orig", type = "REEL", media = listOf(video), author = ApiAuthor(id = "u9", username = "orig"))
        val withPoster = RepostEmbedBuilder.forPost(ApiPost(id = "outer", type = "POST", repostOf = source), Prefs, "https://cdn.test")
        assertThat((withPoster!!.reelCover as ReelCover.Poster).url).isEqualTo("https://cdn.test/u/v.jpg")

        val bare = RepostEmbedBuilder.forPost(ApiPost(id = "outer", type = "POST", repostOf = source.copy(media = listOf(audio))), Prefs, null)
        assertThat(bare!!.reelCover).isEqualTo(ReelCover.Backdrop(isVideo = false, accentHex = DynamicColorGenerator.colorForName("u9")))
    }

    /** iOS `ReelRepostEmbedCell` n'a aucune scène : un réel composé cité est une bande de 116 pt, l'aplat de son auteur et la note de musique. */
    @Test
    fun `le reel compose cite d un repost reste une bande d aplat, jamais une scene 9 16`() {
        val source = ApiRepostOf(id = "orig", type = "REEL", media = listOf(audio), storyEffects = scene, author = ApiAuthor(id = "u9", username = "orig"))
        val embed = RepostEmbedBuilder.forPost(ApiPost(id = "outer", type = "POST", repostOf = source, storyEffects = scene), Prefs, null)
        assertThat(embed!!.reelCover).isEqualTo(ReelCover.Backdrop(isVideo = false, accentHex = DynamicColorGenerator.colorForName("u9")))
    }

    @Test
    fun `un repost qui n est pas un reel n a pas de couverture`() {
        val plain = RepostEmbedBuilder.forPost(ApiPost(id = "o", type = "POST", repostOf = ApiRepostOf(id = "x", type = "POST")), Prefs, null)
        assertThat(plain!!.reelCover).isNull()
    }
    /** iOS `ReelFeedCard.repostedReel` : un réel republié sans média propre ne montre qu'UNE couverture, celle du réel cité. */
    @Test
    fun `un reel republie ne porte qu une couverture, celle de la citation avec l auteur d origine`() {
        val landscape = video.copy(width = 1920, height = 1080)
        val source = ApiRepostOf(id = "orig", type = "REEL", media = listOf(landscape), author = ApiAuthor(id = "u9", username = "orig"))
        val republished = FeedPostBuilder.build(
            ApiPost(id = "r2", type = "REEL", media = emptyList(), repostOf = source, author = ApiAuthor(id = "u1", username = "amina")),
            Prefs,
            mediaBaseUrl = "https://cdn.test",
        )
        assertThat((republished.reelCover as ReelCover.Poster).url).isEqualTo("https://cdn.test/u/v.jpg")
        assertThat(republished.republishedReel!!.id).isEqualTo("orig")
        assertThat(republished.reelOpenId).isEqualTo("orig")
        assertThat(republished.showsReelCard).isTrue()
        assertThat(republished.reelAspect).isEqualTo(4f / 3f)
    }

    @Test
    fun `un reel republie dont l original n est plus servi garde sa couverture`() {
        val republished = FeedPostBuilder.build(
            ApiPost(id = "r3", type = "REEL", media = emptyList(), originalRepostOfId = "gone", author = ApiAuthor(id = "u1", username = "amina")),
            Prefs,
            mediaBaseUrl = "https://cdn.test",
        )
        assertThat(republished.repostEmbed!!.isUnavailable).isTrue()
        assertThat(republished.reelCover).isNotNull()
        assertThat(republished.republishedReel).isNull()
        assertThat(republished.reelOpenId).isEqualTo("r3")
    }

    @Test
    fun `un reel republie avec son propre media garde sa couverture a cote de la citation`() {
        val source = ApiRepostOf(id = "orig", type = "REEL", media = listOf(video))
        val own = FeedPostBuilder.build(
            ApiPost(id = "r4", type = "REEL", media = listOf(image), repostOf = source),
            Prefs,
            mediaBaseUrl = "https://cdn.test",
        )
        assertThat((own.reelCover as ReelCover.Poster).url).isEqualTo("https://cdn.test/u/i.jpg")
        assertThat(own.republishedReel).isNull()
        assertThat(own.reelOpenId).isEqualTo("r4")
    }
}
