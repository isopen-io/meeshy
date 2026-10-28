package me.meeshy.sdk.model.composer

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.CanvasV3FixtureSupport
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostStoryEffectsWireSerializer
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * #13612 — the document Android publishes for a post of photos is the one iOS publishes, read off the shared fixtures
 * `post-photo-scenes-2` and `post-photo-scenes-3-hero`. Those two files were PRODUCED by the iOS composer itself (its
 * `StoryComposerViewModel.applyContentMedia` per slide, `ComposerStoryCanvas.publishedSlide`, then the outbox's
 * `CanvasMediaAdoption.adopting` and `sanitizedForServerPublish`), not written by hand. Only the values iOS draws from a
 * counter or a clock are set aside: the content object's id (a UUID), `z`, and the last digits of an aspect ratio iOS
 * measures on its downsampled bitmap.
 */
class PostPhotoScenesIosFixtureTest {
    @Serializable
    private data class Body(@Serializable(with = PostStoryEffectsWireSerializer::class) val storyEffects: StoryEffects? = null)

    private val json = Json { encodeDefaults = false; explicitNulls = false; ignoreUnknownKeys = true }

    private val sizes = listOf(1200 to 800, 900 to 1200, 1000 to 1000)

    private fun photos(count: Int): List<UploadedMedia> = (1..count).map { index ->
        val id = "64b00000000000000000000$index"
        val (width, height) = sizes[index - 1]
        UploadedMedia(id, "https://gate.meeshy.me/api/v1/attachments/file/$id.jpg", "image/jpeg", 1L, width, height, null, null)
    }

    private fun published(count: Int, layout: MosaicLayoutMode?): JsonElement {
        val body = json.encodeToString(Body(PostPhotoScenes.storyEffects("POST", photos(count), "fr", layout, null)))
        return json.parseToJsonElement(body).jsonObject.getValue("storyEffects")
    }

    private fun withoutCounters(element: JsonElement, key: String? = null): JsonElement = when (element) {
        is JsonObject -> JsonObject(
            element.filterKeys { it != "z" }.mapValues { (k, v) ->
                if (k == "id" && v is JsonPrimitive && element["plane"] == JsonPrimitive("content")) JsonPrimitive("content-object") else withoutCounters(v, k)
            },
        )
        is JsonArray -> JsonArray(element.map { withoutCounters(it) })
        is JsonPrimitive -> if (key == "aspectRatio") JsonPrimitive(Math.round(element.doubleOrNull!! * 1000) / 1000.0) else element
    }

    @Test
    fun `two photos publish the very document iOS publishes`() {
        CanvasV3FixtureSupport.assertSameJson(
            withoutCounters(CanvasV3FixtureSupport.fixture("post-photo-scenes-2")),
            withoutCounters(published(2, null)),
        )
    }

    @Test
    fun `three photos with a chosen layout publish the very document iOS publishes`() {
        CanvasV3FixtureSupport.assertSameJson(
            withoutCounters(CanvasV3FixtureSupport.fixture("post-photo-scenes-3-hero")),
            withoutCounters(published(3, MosaicLayoutMode.HERO)),
        )
    }
}
