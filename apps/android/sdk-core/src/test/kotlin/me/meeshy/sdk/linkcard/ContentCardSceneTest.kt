package me.meeshy.sdk.linkcard

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.contentcard.ContentCardProjection
import me.meeshy.sdk.theme.storyAccentHex
import org.junit.Test

/**
 * La scène que la carte d'un contenu dessine (#20233) : la scène de base du contenu MONTRÉ, prête pour le player — une
 * page par scène du document, chacune avec ses seules pièces, sur le sol de son auteur. Rien quand la carte n'élit pas
 * de scène.
 */
class ContentCardSceneTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun post(body: String): ApiPost = json.decodeFromString(ApiPost.serializer(), body)

    private fun object_(id: String, kind: String, payload: String, plane: String = "content") =
        """{"id":"$id","kind":"$kind","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"$plane","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":$payload}"""

    private val background = object_("bg", "media", """{"postMediaId":"m-img","mediaType":"image","isBackground":true}""")
    private val title = object_("t1", "text", """{"text":"Bonjour"}""", plane = "fg")
    private val image = """{"id":"m-img","mimeType":"image/jpeg","fileUrl":"/f/i.jpg","thumbnailUrl":"/t/i.jpg"}"""
    private val other = """{"id":"m-other","mimeType":"image/jpeg","fileUrl":"/f/o.jpg"}"""
    private val author = """{"id":"a1","username":"amani","displayName":"Amani Diallo"}"""

    private fun effects(vararg scenes: String) =
        """{"v":3,"scenes":[${scenes.joinToString(",")}]}"""

    private fun scene(id: String, vararg objects: String) = """{"id":"$id","objects":[${objects.joinToString(",")}]}"""

    private fun cardScene(post: ApiPost) = post.contentCardScene(ContentCardProjection.of(post, prefs = null, linkType = null))

    @Test
    fun `a story with one scene gives one page carrying its background and its text, on its author's floor`() {
        val story = post(
            """{"id":"s1","type":"STORY","author":$author,"media":[$image,$other],"storyEffects":${effects(scene("a", background, title))}}""",
        )
        val scene = checkNotNull(cardScene(story))
        assertThat(scene.items).hasSize(1)
        val page = scene.items.single()
        assertThat(page.id).isEqualTo("s1")
        assertThat(page.storyEffects?.textObjects?.map { it.text }).containsExactly("Bonjour")
        assertThat(page.media.map { it.id }).containsExactly("m-img")
        assertThat(scene.accentHex).isEqualTo(story.author.storyAccentHex())
    }

    @Test
    fun `the bare repost of a story of two scenes gives the original's two pages, on the original author's floor`() {
        val original = """{"id":"o1","type":"STORY","author":{"id":"o","username":"lume"},"media":[$image],""" +
            """"storyEffects":${effects(scene("a", background, title), scene("b", title))}}"""
        val repost = post("""{"id":"r1","type":"POST","author":$author,"content":null,"repostOf":$original}""")
        val scene = checkNotNull(cardScene(repost))
        assertThat(scene.items.map { it.id }).containsExactly("o1#scene-0", "o1#scene-1").inOrder()
        assertThat(scene.items[0].media.map { it.id }).containsExactly("m-img")
        assertThat(scene.items[1].media).isEmpty()
        assertThat(scene.accentHex).isEqualTo(repost.repostOf?.author.storyAccentHex())
    }

    @Test
    fun `a post the card shows by its media has no scene to draw`() {
        assertThat(cardScene(post("""{"id":"p1","type":"POST","author":$author,"media":[$image,$other]}"""))).isNull()
        assertThat(cardScene(post("""{"id":"p2","type":"POST","author":$author,"content":"Juste des mots"}"""))).isNull()
    }
}
