package me.meeshy.sdk.model.contentcard

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/**
 * **Ce que le bloc visuel de la carte d'un contenu montre** (#20233, jumelle de #20211) — la règle rejouée sur le fichier
 * que Swift (`ContentCardVisualVectorTests`) et le web (`content-card-visual.test.ts`) rejouent aussi :
 * `packages/shared/fixtures/content-card-visual/content-card-visual.vectors.json`. Plusieurs médias se font glisser, une
 * vidéo montre son image de garde, un son seul se joue, sinon la scène composée se dessine — et rien pour du texte seul.
 */
class ContentCardVisualVectorParityTest {

    private data class Vector(val label: String, val post: ApiPost, val expected: JsonObject)

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private val vectors: List<Vector> =
        Json.parseToJsonElement(SharedFixtures.file(FIXTURE).readText()).jsonArray.map { element ->
            val case = element.jsonObject
            Vector(
                label = case.stringOrNull("_label") ?: error("$FIXTURE : un cas sans _label"),
                post = json.decodeFromJsonElement(ApiPost.serializer(), case["post"] ?: error("$FIXTURE : un cas sans post")),
                expected = case["expected"]?.jsonObject ?: error("$FIXTURE : un cas sans expected"),
            )
        }

    private fun card(post: ApiPost) = ContentCardProjection.of(post, prefs = null, linkType = null)

    /** Le visuel rendu, dans le vocabulaire neutre du fichier : identités et indices, jamais des adresses résolues. */
    private fun described(visual: ContentCardVisual): Map<String, Any?> = when (visual) {
        ContentCardVisual.None -> mapOf("kind" to "none")
        is ContentCardVisual.Media -> mapOf("kind" to "media", "mediaId" to visual.media.id, "mediaKind" to kindOf(visual.media))
        is ContentCardVisual.Slideshow -> mapOf("kind" to "slideshow", "pages" to visual.pages.map(::describedPage))
        is ContentCardVisual.Sound ->
            mapOf("kind" to "sound", "attachmentId" to visual.attachmentId, "url" to visual.url, "durationSeconds" to visual.durationSeconds)
        is ContentCardVisual.Scene -> mapOf("kind" to "scene", "index" to visual.index)
    }

    private fun describedPage(page: ContentCardPage): Map<String, Any?> = when (page) {
        is ContentCardPage.Media -> mapOf("mediaId" to page.media.id, "mediaKind" to kindOf(page.media))
        is ContentCardPage.Scene -> mapOf("scene" to page.index)
    }

    private fun kindOf(media: ContentCardMedia) = if (media.isVideo) "video" else "image"

    private fun expectedOf(expected: JsonObject): Map<String, Any?> = when (val kind = expected.stringOrNull("kind")) {
        "none" -> mapOf("kind" to "none")
        "media" -> mapOf("kind" to "media", "mediaId" to expected.stringOrNull("mediaId"), "mediaKind" to expected.stringOrNull("mediaKind"))
        "slideshow" -> mapOf(
            "kind" to "slideshow",
            "pages" to (expected["pages"] as JsonArray).map { page ->
                val obj = page.jsonObject
                obj["scene"]?.jsonPrimitive?.intOrNull?.let { mapOf("scene" to it) }
                    ?: mapOf("mediaId" to obj.stringOrNull("mediaId"), "mediaKind" to obj.stringOrNull("mediaKind"))
            },
        )
        "sound" -> mapOf(
            "kind" to "sound",
            "attachmentId" to expected.stringOrNull("attachmentId"),
            "url" to expected.stringOrNull("url"),
            "durationSeconds" to expected["durationSeconds"]?.jsonPrimitive?.intOrNull,
        )
        "scene" -> mapOf("kind" to "scene", "index" to expected["index"]?.jsonPrimitive?.intOrNull)
        else -> error("$FIXTURE : issue inconnue « $kind »")
    }

    @Test
    fun `the shared file is read and covers every visual, an empty loop cannot pass`() {
        assertThat(vectors.size).isAtLeast(14)
        assertThat(vectors.map { it.expected.stringOrNull("kind") }.toSet())
            .containsExactly("none", "media", "slideshow", "sound", "scene")
    }

    @Test
    fun `every shared vector elects the visual iOS and the web elect`() {
        vectors.forEach { vector ->
            assertWithMessage(vector.label).that(described(card(vector.post).visual)).isEqualTo(expectedOf(vector.expected))
        }
    }

    @Test
    fun `a drawn scene names the content that carries it, the original of a bare repost`() {
        vectors.filter { it.expected.stringOrNull("carrierId") != null }.also { assertThat(it).isNotEmpty() }.forEach { vector ->
            assertWithMessage(vector.label).that(card(vector.post).sceneCarrierId).isEqualTo(vector.expected.stringOrNull("carrierId"))
        }
    }

    @Test
    fun `a slideshow page keeps its own frame, a reel page its portrait`() {
        val reel = vectors.first { it.post.type == "REEL" && it.expected.stringOrNull("kind") == "slideshow" }
        val pages = (card(reel.post).visual as ContentCardVisual.Slideshow).pages.filterIsInstance<ContentCardPage.Media>()
        assertThat(pages.map { it.media.aspectRatio }.toSet()).containsExactly(9f / 16f)
        assertThat(pages.map { it.media.extraCount }.toSet()).containsExactly(0)
    }

    private companion object {
        const val FIXTURE = "content-card-visual/content-card-visual.vectors.json"
    }
}
