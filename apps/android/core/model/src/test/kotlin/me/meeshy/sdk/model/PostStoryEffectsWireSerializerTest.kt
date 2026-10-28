package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class PostStoryEffectsWireSerializerTest {

    @Serializable
    private data class Body(@Serializable(with = PostStoryEffectsWireSerializer::class) val storyEffects: StoryEffects? = null)

    private val json = Json { encodeDefaults = false; explicitNulls = false; ignoreUnknownKeys = true }

    private fun wire(effects: StoryEffects?): JsonObject =
        json.parseToJsonElement(json.encodeToString(Body(effects))).jsonObject

    @Test
    fun `a background alone is published as the v3 document iOS publishes`() {
        val document = wire(StoryEffects(background = "302B63"))["storyEffects"]!!.jsonObject

        assertThat(document["v"]!!.jsonPrimitive.int).isEqualTo(3)
        val scene = document["scenes"]!!.jsonArray.single().jsonObject
        val bg = scene["objects"]!!.jsonArray.single().jsonObject
        assertThat(bg["id"]!!.jsonPrimitive.content).isEqualTo("bg")
        assertThat(bg["plane"]!!.jsonPrimitive.content).isEqualTo("bg")
        assertThat(bg["payload"]!!.jsonObject["background"]!!.jsonPrimitive.content).isEqualTo("302B63")
        assertThat(document.keys).doesNotContain("background")
    }

    @Test
    fun `the v3 document is what the migration of the same effects gives, not a second reading of it`() {
        val effects = StoryEffects(background = "FF2E63")

        assertThat(wire(effects)["storyEffects"]).isEqualTo(CanvasV3Migration.wireDocument(effects))
    }

    @Test
    fun `a background alone leaves Android as the very document iOS and the gateway converter write for it`() {
        // `CanvasV3(migrating: StoryEffects(background:))` (MeeshySDK) and `convertV1ToV3({ background })` (gateway),
        // printed for this colour: the same keys, the same order of meaning, `transform: null` on the carrier included.
        val written = Json.parseToJsonElement(
            """{"v":3,"scenes":[{"id":"s1","objects":[{"id":"bg","kind":"media","anchor":{"t":"free","x":0.5,"y":0.5},""" +
                """"plane":"bg","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},""" +
                """"payload":{"background":"302B63","transform":null}}]}]}""",
        )

        CanvasV3FixtureSupport.assertSameJson(written, wire(StoryEffects(background = "302B63"))["storyEffects"]!!)
    }

    @Test
    fun `read back, the document gives the post its colour again`() {
        val text = json.encodeToString(Body(StoryEffects(background = "08D9D6")))

        assertThat(json.decodeFromString<Body>(text).storyEffects?.background).isEqualTo("08D9D6")
    }

    @Test
    fun `an effect set that is more than a background keeps its v1 wire, nothing is lost in translation`() {
        val effects = StoryEffects(background = "302B63", textObjects = listOf(StoryTextObject(id = "t", text = "x", x = 0.5, y = 0.5)))

        val document = wire(effects)["storyEffects"]!!.jsonObject

        assertThat(document.keys).doesNotContain("v")
        assertThat(document["background"]).isEqualTo(JsonPrimitive("302B63"))
    }

    @Test
    fun `no effects, no key, and an empty set stays the empty object`() {
        assertThat(wire(null).keys).isEmpty()
        assertThat(wire(StoryEffects())["storyEffects"]).isEqualTo(JsonObject(emptyMap()))
    }

    @Test
    fun `a layout travels in the v3 document next to the background, as iOS writes canvasV3 layout`() {
        val document = wire(StoryEffects(background = "302B63", layout = MosaicLayoutMode.HERO))["storyEffects"]!!.jsonObject

        assertThat(document["v"]!!.jsonPrimitive.int).isEqualTo(3)
        assertThat(document["layout"]!!.jsonPrimitive.content).isEqualTo("hero")
        assertThat(document["scenes"]!!.jsonArray).hasSize(1)
    }

    @Test
    fun `a layout alone is a v3 document with no scene, which the gateway schema allows`() {
        val document = wire(StoryEffects(layout = MosaicLayoutMode.WAVE))["storyEffects"]!!.jsonObject

        assertThat(document["v"]!!.jsonPrimitive.int).isEqualTo(3)
        assertThat(document["layout"]!!.jsonPrimitive.content).isEqualTo("wave")
        assertThat(document.keys).doesNotContain("scenes")
    }

    @Test
    fun `read back, the document gives the post its layout again and every wire value is one of the five`() {
        MosaicLayoutMode.entries.forEach { mode ->
            val text = json.encodeToString(Body(StoryEffects(layout = mode)))
            assertThat(json.decodeFromString<Body>(text).storyEffects?.layout).isEqualTo(mode)
        }
    }

    @Test
    fun `a layout beside richer effects keeps the v1 wire, nothing is lost in translation`() {
        val effects = StoryEffects(layout = MosaicLayoutMode.SINE, textObjects = listOf(StoryTextObject(id = "t", text = "x", x = 0.5, y = 0.5)))

        assertThat(wire(effects)["storyEffects"]!!.jsonObject.keys).doesNotContain("v")
    }
}
