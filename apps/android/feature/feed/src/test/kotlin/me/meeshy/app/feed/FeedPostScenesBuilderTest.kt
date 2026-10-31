package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

/** #13863 R7 — le fil projette les scènes d'un post composé sur la scène ; un post sans scène garde son rendu. */
class FeedPostScenesBuilderTest {
    private data class Prefs(
        override val systemLanguage: String? = "fr",
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val media = """[
        { "id": "64b000000000000000000001", "fileUrl": "https://cdn.meeshy.me/1.jpg", "mimeType": "image/jpeg" },
        { "id": "64b000000000000000000002", "fileUrl": "https://cdn.meeshy.me/2.jpg", "mimeType": "image/jpeg" }
    ]"""

    private fun fixture(name: String): String =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/fixtures/canvas-v3/$name.json") }
            .firstOrNull { it.isFile }?.readText()
            ?: throw AssertionError("Fixture partagée introuvable : canvas-v3/$name.json")

    private fun build(json: String) =
        FeedPostBuilder.build(MeeshyApi.json.decodeFromString(ApiPost.serializer(), json), Prefs(), mediaBaseUrl = null)

    @Test
    fun `the post of two photos iOS published projects its two scenes, in the carousel its author chose`() {
        val post = build("""{ "id": "p1", "type": "POST", "content": "deux vues", "media": $media, "storyEffects": ${fixture("post-photo-scenes-2")} }""")

        val scenes = requireNotNull(post.scenes)
        assertThat(scenes.items).hasSize(2)
        assertThat(scenes.layout).isEqualTo(MosaicLayoutMode.CAROUSEL)
        assertThat(post.carriesScene).isTrue()
    }

    @Test
    fun `a text post and a post of bare photos keep their feed rendering`() {
        val text = build("""{ "id": "p1", "type": "POST", "content": "juste du texte" }""")
        val photos = build("""{ "id": "p2", "type": "POST", "media": $media }""")

        assertThat(text.scenes).isNull()
        assertThat(text.carriesScene).isFalse()
        assertThat(photos.scenes).isNull()
        assertThat(photos.images.map { it.id }).containsExactly("64b000000000000000000001", "64b000000000000000000002").inOrder()
    }

    @Test
    fun `a reel keeps its own reel card`() {
        val reel = build("""{ "id": "r1", "type": "REEL", "storyEffects": ${fixture("v1-legacy-rich.v3")} }""")

        assertThat(reel.scenes).isNull()
    }
}
