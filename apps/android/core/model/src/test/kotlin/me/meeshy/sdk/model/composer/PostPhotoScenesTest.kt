package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.CanvasV3FixtureSupport
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostStoryEffectsWireSerializer
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * #13612 — a post of several photos leaves Android as the document of scenes iOS writes for it: one scene per photo,
 * `layout` only inside that document. The expected documents below are the ones `CanvasV3(migrating: slides, layout:)`
 * gives for the slides `MeeshyComposerHost.syncPostMediaIntoSlides` builds (one slide per photo, its media object
 * `isBackground` + `loop`, the slide framing `videoFitMode: "fit"` by `StoryBackgroundFraming.posedFitMode`), read off
 * `CanvasV3Migration.swift` (`migratedScene` / `mediaPayload`) and the shared fixtures — object ids and z-order are the
 * only values iOS draws from a counter (UUID, `nextZIndex`), and no reader looks at either.
 */
class PostPhotoScenesTest {
    @Serializable
    private data class Body(@Serializable(with = PostStoryEffectsWireSerializer::class) val storyEffects: StoryEffects? = null)

    private val json = Json { encodeDefaults = false; explicitNulls = false; ignoreUnknownKeys = true }

    private fun photo(id: String, width: Int? = null, height: Int? = null, mime: String = "image/jpeg") =
        UploadedMedia(id, "https://cdn.meeshy.me/p/$id.jpg", mime, 1L, width, height, null, null)

    private fun wire(effects: StoryEffects?): JsonElement =
        json.parseToJsonElement(json.encodeToString(Body(effects))).jsonObject.getValue("storyEffects")

    private fun scene(index: Int, id: String, url: String, aspect: String = "", locale: String = "\"fr\"") =
        """{"id":"s$index","objects":[""" +
            """{"id":"bg","kind":"media","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"bg","z":0,""" +
            """"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{"transform":{"videoFitMode":"fit"}}},""" +
            """{"id":"m$index","kind":"media","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"content","z":1,""" +
            """"transform":{"scale":1,"rotation":0,"opacity":1},"locale":$locale,""" +
            """"payload":{"postMediaId":"$id",${if (url.isEmpty()) "" else """"mediaURL":"$url","""}"mediaType":"image",""" +
            """"loop":true,"isBackground":true$aspect}}]}"""

    private val two = listOf(photo("a1", 1200, 800), photo("b2"))

    @Test
    fun `two photos leave as two scenes, each its own photo, no layout key`() {
        val expected = Json.parseToJsonElement(
            """{"v":3,"scenes":[${scene(1, "a1", "https://cdn.meeshy.me/p/a1.jpg", ""","aspectRatio":1.5""")},""" +
                """${scene(2, "b2", "https://cdn.meeshy.me/p/b2.jpg")}]}""",
        )

        CanvasV3FixtureSupport.assertSameJson(expected, wire(PostPhotoScenes.effects(two, "fr", null)))
    }

    @Test
    fun `three photos with a chosen layout carry it in the document, after the scenes`() {
        val three = two + photo("c3")
        val document = wire(PostPhotoScenes.effects(three, "fr", MosaicLayoutMode.WAVE)).jsonObject

        assertThat(document["scenes"]!!.jsonArray).hasSize(3)
        assertThat(document["layout"]).isEqualTo(JsonPrimitive("wave"))
        assertThat(document["v"]).isEqualTo(JsonPrimitive(3))
    }

    @Test
    fun `every photo of the post is designated by exactly one scene, in order`() {
        val three = listOf(photo("a1"), photo("b2"), photo("c3"))
        val scenes = wire(PostPhotoScenes.effects(three, "fr", null)).jsonObject["scenes"]!!.jsonArray

        val designated = scenes.map { scene ->
            scene.jsonObject["objects"]!!.jsonArray.map { it.jsonObject }
                .filter { it["plane"] == JsonPrimitive("content") }
                .map { it["payload"]!!.jsonObject["postMediaId"] }
        }
        assertThat(designated).containsExactly(
            listOf(JsonPrimitive("a1")), listOf(JsonPrimitive("b2")), listOf(JsonPrimitive("c3")),
        ).inOrder()
    }

    @Test
    fun `a photo still on the device designates its provisional id and carries no address`() {
        val pending = UploadedMedia("cmid_11111111-1111-1111-1111-111111111111", "content://media/9", "image/jpeg", 1L, null, null, null, null)
        val document = wire(PostPhotoScenes.effects(listOf(photo("a1"), pending), "fr", null)).toString()

        assertThat(document).contains("\"postMediaId\":\"cmid_11111111-1111-1111-1111-111111111111\"")
        assertThat(document).doesNotContain("content://")
    }

    @Test
    fun `no document for one photo, a video, a sound, a reel or more scenes than the contract allows`() {
        val video = photo("v1", mime = "video/mp4")
        val sound = photo("s1", mime = "audio/ogg")
        assertThat(PostPhotoScenes.effects(listOf(photo("a1")), "fr", null)).isNull()
        assertThat(PostPhotoScenes.effects(two + video, "fr", null)).isNull()
        assertThat(PostPhotoScenes.effects(two + sound, "fr", null)).isNull()
        assertThat(PostPhotoScenes.sceneCount(listOf("image/png", "image/png"), ComposerFormat.REEL)).isEqualTo(0)
        assertThat(PostPhotoScenes.sceneCount(List(11) { "image/png" }, ComposerFormat.POST)).isEqualTo(0)
        assertThat(PostPhotoScenes.sceneCount(List(10) { "image/png" }, ComposerFormat.POST)).isEqualTo(10)
    }

    @Test
    fun `a layout is written only where the control is offered, a reel or a lone photo never carries one`() {
        assertThat(PostPhotoScenes.storyEffects("REEL", two, "fr", MosaicLayoutMode.HERO, null)).isNull()
        assertThat(PostPhotoScenes.storyEffects("POST", listOf(photo("a1")), "fr", MosaicLayoutMode.HERO, null)).isNull()
        val none = PostPhotoScenes.storyEffects("POST", two, "fr", null, null)!!.canvas!!
        assertThat(none.layout).isNull()
    }

    @Test
    fun `a colour scene alone never rides over photos, and stays when there are none`() {
        assertThat(PostPhotoScenes.storyEffects("POST", emptyList(), "fr", null, "302B63"))
            .isEqualTo(StoryEffects(background = "302B63"))
        assertThat(PostPhotoScenes.storyEffects("POST", two + photo("v1", mime = "video/mp4"), "fr", null, "302B63")).isNull()
        assertThat(PostPhotoScenes.storyEffects("POST", listOf(photo("a1")), "fr", null, null)).isNull()
    }

    private fun backgroundOf(scene: JsonElement): JsonElement? =
        scene.jsonObject["objects"]!!.jsonArray.map { it.jsonObject }
            .single { it["plane"] == JsonPrimitive("bg") }["payload"]!!.jsonObject["background"]

    @Test
    fun `the colour chosen under several photos stays under the first one, as iOS keeps it on the slide it was laid on`() {
        val scenes = wire(PostPhotoScenes.storyEffects("POST", two, "fr", null, "302B63")).jsonObject["scenes"]!!.jsonArray

        assertThat(scenes.map(::backgroundOf)).containsExactly(JsonPrimitive("302B63"), null).inOrder()
    }

    @Test
    fun `a single photo on a colour leaves as a one scene document carrying both, never the colour alone`() {
        val document = wire(PostPhotoScenes.storyEffects("POST", listOf(photo("a1")), "fr", MosaicLayoutMode.HERO, "302B63"))
            .jsonObject

        assertThat(document.keys).containsExactly("v", "scenes").inOrder()
        val scene = document["scenes"]!!.jsonArray.single()
        assertThat(backgroundOf(scene)).isEqualTo(JsonPrimitive("302B63"))
        assertThat(scene.toString()).contains("\"postMediaId\":\"a1\"")
    }

    @Test
    fun `read back after the outbox, a single photo on a colour keeps its one scene document`() {
        val text = json.encodeToString(Body(PostPhotoScenes.storyEffects("POST", listOf(photo("a1")), "fr", null, "302B63")))

        val back = json.decodeFromString<Body>(text).storyEffects!!

        assertThat(back.canvas!!.scenes).hasSize(1)
        assertThat(json.encodeToString(Body(back))).isEqualTo(text)
    }

    @Test
    fun `read back after the outbox, the document keeps every scene and writes the very same json`() {
        val effects = PostPhotoScenes.effects(two + photo("c3"), "fr", MosaicLayoutMode.HERO)!!
        val text = json.encodeToString(Body(effects))

        val back = json.decodeFromString<Body>(text).storyEffects!!

        assertThat(back.canvas!!.scenes).hasSize(3)
        assertThat(back.canvas!!.layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(json.encodeToString(Body(back))).isEqualTo(text)
    }

    @Test
    fun `the document is a v3 object, not the v1 blob`() {
        val document = wire(PostPhotoScenes.effects(two, "fr", null)) as JsonObject
        assertThat(document.keys).containsExactly("v", "scenes").inOrder()
    }
}
