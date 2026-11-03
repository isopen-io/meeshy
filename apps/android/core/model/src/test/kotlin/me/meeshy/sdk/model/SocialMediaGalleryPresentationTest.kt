package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

class SocialMediaGalleryPresentationTest {

    private class Prefs(
        override val systemLanguage: String? = "fr",
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun image(id: String, caption: String? = null, translations: Map<String, String>? = null, lang: String? = null) =
        ApiPostMedia(
            id = id, mimeType = "image/jpeg", fileUrl = "https://m/$id.jpg", thumbnailUrl = "https://m/$id-t.jpg",
            caption = caption, captionLanguage = lang,
            captionTranslations = translations?.mapValues { ApiMediaCaptionTranslationEntry(text = it.value) },
        )

    private fun video(id: String) = ApiPostMedia(id = id, mimeType = "video/mp4", fileUrl = "https://m/$id.mp4", duration = 4000)
    private fun audio(id: String) = ApiPostMedia(id = id, mimeType = "audio/mpeg", fileUrl = "https://m/$id.mp3")

    private fun post(media: List<ApiPostMedia>, content: String? = null, name: String = "Ana") =
        ApiPost(id = "p1", content = content, media = media, createdAt = "2026-01-01T10:00:00Z", author = ApiAuthor(id = "u1", displayName = name, avatar = "https://a/u1"))

    private fun comment(id: String, media: List<ApiPostMedia>, content: String = "", name: String = "Bob") =
        ApiPostComment(id = id, content = content, media = media, createdAt = "2026-01-02T10:00:00Z", author = ApiAuthor(id = "u2", username = "bob", displayName = name))

    private fun compose(post: ApiPost, comments: List<ApiPostComment> = emptyList(), scenes: List<GalleryScenePage> = emptyList(), prefs: Prefs = Prefs()) =
        SocialMediaGalleryPresentation.compose(post, comments, prefs, scenes)

    @Test
    fun `les pages sont typees image et video et l'audio n'est pas pagine`() {
        val gallery = compose(post(listOf(image("a"), audio("x"), video("v"))))
        assertThat(gallery.pages.map { it.id to it.kind }).containsExactly("a" to GalleryPageKind.IMAGE, "v" to GalleryPageKind.VIDEO).inOrder()
    }

    @Test
    fun `la legende propre au media est servie dans la langue du lecteur`() {
        val gallery = compose(post(listOf(image("a", "Hello", mapOf("fr" to "Bonjour"), "en"), image("b"))))
        assertThat(gallery.pages[0].caption).isEqualTo("Bonjour")
        assertThat(gallery.pages[1].caption).isNull()
    }

    @Test
    fun `une traduction d'un rang inferieur est servie quand le premier rang manque`() {
        val gallery = compose(
            post(listOf(image("a", "Hello", mapOf("es" to "Hola"), "en"), image("b"))),
            prefs = Prefs(systemLanguage = "fr", regionalLanguage = "es"),
        )
        assertThat(gallery.pages[0].caption).isEqualTo("Hola")
    }

    @Test
    fun `le texte du post legende seulement un post a un seul visuel`() {
        val single = compose(post(listOf(image("a")), content = " Texte "))
        val many = compose(post(listOf(image("a"), image("b")), content = "Texte"))
        assertThat(single.pages[0].caption).isEqualTo("Texte")
        assertThat(many.pages.map { it.caption }).containsExactly(null, null)
    }

    @Test
    fun `l'auteur est affiche par page, celui du post puis celui du commentaire`() {
        val gallery = compose(post(listOf(image("a"))), listOf(comment("c1", listOf(image("m")))))
        assertThat(gallery.pages[0].attribution.name).isEqualTo("Ana")
        assertThat(gallery.pages[0].attribution.commentId).isNull()
        assertThat(gallery.pages[1].attribution.name).isEqualTo("Bob")
        assertThat(gallery.pages[1].attribution.commentId).isEqualTo("c1")
        assertThat(gallery.pages[1].attribution.createdAtIso).isEqualTo("2026-01-02T10:00:00Z")
    }

    @Test
    fun `les medias de commentaires suivent ceux du post et un doublon garde le premier`() {
        val gallery = compose(post(listOf(image("a"))), listOf(comment("c1", listOf(image("a"), video("v")), content = "Regarde")))
        assertThat(gallery.pages.map { it.id }).containsExactly("a", "v").inOrder()
        assertThat(gallery.pages[1].caption).isEqualTo("Regarde")
    }

    @Test
    fun `un emplacement de scene remplace les medias du post et garde les commentaires apres`() {
        val scenes = listOf(
            GalleryScenePage(index = 0, mediaId = "a", caption = "Ouverture", thumbnailUrl = "t0"),
            GalleryScenePage(index = 1, mediaId = null, caption = null, thumbnailUrl = null),
        )
        val gallery = compose(post(listOf(image("a"))), listOf(comment("c1", listOf(image("m")))), scenes)
        assertThat(gallery.pages.map { it.kind }).containsExactly(GalleryPageKind.SCENE, GalleryPageKind.SCENE, GalleryPageKind.IMAGE).inOrder()
        assertThat(gallery.pages[0].id).isEqualTo("scene:p1#0")
        assertThat(gallery.pages[0].caption).isEqualTo("Ouverture")
        assertThat(gallery.pages[0].attribution.name).isEqualTo("Ana")
    }

    @Test
    fun `seule une page image porte un fichier, les autres recoivent une piece synthetique inerte`() {
        val gallery = compose(post(listOf(image("a"), video("v"))))
        assertThat(gallery.pages.map { it.hasSyntheticAttachment }).containsExactly(false, true).inOrder()
        assertThat(gallery.pages.all { !it.reportsConsumption }).isTrue()
    }

    @Test
    fun `l'entree choisit le media demande puis la scene qui le montre puis l'index de scene`() {
        val scenes = listOf(GalleryScenePage(0, null, null, null), GalleryScenePage(1, "b", null, null))
        val withScenes = compose(post(listOf(image("a"), image("b"))), scenes = scenes)
        assertThat(withScenes.entryIndex("b", 0)).isEqualTo(1)
        assertThat(withScenes.entryIndex(null, 1)).isEqualTo(1)
        assertThat(withScenes.entryIndex(null, 99)).isEqualTo(1)
        val plain = compose(post(listOf(image("a"), image("b"))), listOf(comment("c", listOf(image("m")))))
        assertThat(plain.entryIndex("m", 0)).isEqualTo(2)
        assertThat(plain.entryIndex("inconnu", 0)).isEqualTo(0)
        assertThat(compose(post(emptyList())).entryIndex(null, 0)).isEqualTo(0)
    }

    @Test
    fun `commenter ce media cite le media du post, jamais celui d'un commentaire`() {
        val p = post(listOf(image("a"), video("v")))
        val gallery = compose(p, listOf(comment("c1", listOf(image("m")))), listOf(GalleryScenePage(0, "v", null, null)))
        val quote = gallery.quotation("scene:p1#0", p)
        assertThat(quote?.postMediaId).isEqualTo("v")
        assertThat(quote?.kind).isEqualTo(CommentQuotedMedia.Kind.VIDEO)
        assertThat(gallery.quotation("m", p)).isNull()
        val plain = compose(p)
        assertThat(plain.quotation("a", p)?.kind).isEqualTo(CommentQuotedMedia.Kind.IMAGE)
    }

    @Test
    fun `le fil rejoint la loi commune, ses pages deja composees suivies des commentaires donnent la meme galerie`() {
        val p = post(listOf(image("a"), image("b")))
        val comments = listOf(comment("c1", listOf(image("m"))))
        val direct = compose(p, comments)
        val viaFeed = SocialMediaGalleryPresentation.following(compose(p).pages, comments, Prefs())
        assertThat(viaFeed).isEqualTo(direct)
    }
}
