package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ScenePostDocument
import org.junit.Test

/**
 * #13863 R7 — le fil Android LIT ce que la scène publie : un post dont la charge porte un document de scènes v3 se relit
 * scène par scène, avec ses calques, sa disposition et son son ; un post sans scène garde son rendu de fil.
 */
class PostSceneReadingTest {
    @Serializable
    private data class Body(@Serializable(with = PostStoryEffectsWireSerializer::class) val storyEffects: StoryEffects? = null)

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private val photo = StoryMediaObject(id = "bg1", postMediaId = "64b0000000000000000000a1", mediaType = "image", isBackground = true)
    private val placed = StoryMediaObject(id = "pose", postMediaId = "64b0000000000000000000a2", mediaType = "image", x = 0.3, y = 0.7, scale = 0.5)
    private val text = StoryTextObject(id = "t1", text = "salut", x = 0.5, y = 0.2)
    private val sticker = StorySticker(id = "k1", emoji = "🔥", x = 0.4, y = 0.6)

    /** La charge que le serveur rend : ce que le compositeur a écrit, servi tel quel dans le post. */
    private fun served(effects: StoryEffects?): ApiPost {
        val written = json.parseToJsonElement(json.encodeToString(Body(effects))).jsonObject["storyEffects"]
        val payload = written?.let { """, "storyEffects": $it""" }.orEmpty()
        return json.decodeFromString(ApiPost.serializer(), """{ "id": "p1", "type": "POST", "content": "le texte"$payload }""")
    }

    private fun servedFixture(name: String): ApiPost =
        json.decodeFromString(ApiPost.serializer(), """{ "id": "p1", "type": "POST", "storyEffects": ${CanvasV3FixtureSupport.fixtureText(name)} }""")

    @Test
    fun `a post published from one scene with text, sticker and a placed image reads back every layer`() {
        val scene = StoryEffects(mediaObjects = listOf(photo, placed), textObjects = listOf(text), stickerObjects = listOf(sticker))

        val read = requireNotNull(PostSceneReading.of(served(ScenePostDocument.effects(listOf(scene), null, ComposerFormat.POST)).storyEffects))

        val only = read.scenes.single()
        assertThat(only.textObjects.map { it.text }).containsExactly("salut")
        assertThat(only.stickerObjects.orEmpty().map { it.emoji }).containsExactly("🔥")
        assertThat(only.mediaObjects.orEmpty().filterNot { it.isBackground }.map { it.postMediaId }).containsExactly(placed.postMediaId)
        assertThat(only.mediaObjects.orEmpty().filter { it.isBackground }.map { it.postMediaId }).containsExactly(photo.postMediaId)
    }

    @Test
    fun `a post of several scenes reads every scene, in order, with the layout its author chose`() {
        val first = StoryEffects(mediaObjects = listOf(photo), textObjects = listOf(text))
        val second = StoryEffects(stickerObjects = listOf(sticker))

        val read = requireNotNull(PostSceneReading.of(served(ScenePostDocument.effects(listOf(first, second), MosaicLayoutMode.WAVE, ComposerFormat.POST)).storyEffects))

        assertThat(read.scenes).hasSize(2)
        assertThat(read.scenes[0].textObjects.map { it.text }).containsExactly("salut")
        assertThat(read.scenes[1].stickerObjects.orEmpty().map { it.emoji }).containsExactly("🔥")
        assertThat(read.layout).isEqualTo(MosaicLayoutMode.WAVE)
    }

    @Test
    fun `each scene designates only its own pieces, so no scene borrows the photo of another`() {
        val first = StoryEffects(mediaObjects = listOf(photo), textObjects = listOf(text))
        val second = StoryEffects(mediaObjects = listOf(placed), stickerObjects = listOf(sticker))

        val read = requireNotNull(PostSceneReading.of(served(ScenePostDocument.effects(listOf(first, second), null, ComposerFormat.POST)).storyEffects))

        assertThat(PostSceneReading.designatedMediaIds(read.scenes[0])).containsExactly(photo.postMediaId)
        assertThat(PostSceneReading.designatedMediaIds(read.scenes[1])).containsExactly(placed.postMediaId)
    }

    @Test
    fun `a text post, a colour post and a post of bare media have no scene and keep their feed rendering`() {
        assertThat(PostSceneReading.of(served(null).storyEffects)).isNull()
        assertThat(PostSceneReading.of(served(StoryEffects(background = "302B63")).storyEffects)).isNull()
        assertThat(PostSceneReading.of(served(ScenePostDocument.effects(emptyList(), null, ComposerFormat.POST)).storyEffects)).isNull()
    }

    @Test
    fun `the post of two photos the iOS composer published reads as its two scenes, each painting its own photo`() {
        val read = requireNotNull(PostSceneReading.of(servedFixture("post-photo-scenes-2").storyEffects))

        assertThat(read.scenes).hasSize(2)
        assertThat(read.scenes.map { scene -> scene.mediaObjects.orEmpty().single { it.isBackground }.postMediaId })
            .containsExactly("64b000000000000000000001", "64b000000000000000000002").inOrder()
        assertThat(read.layout).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }

    @Test
    fun `the three photos iOS published in hero keep their hero layout`() {
        val read = requireNotNull(PostSceneReading.of(servedFixture("post-photo-scenes-3-hero").storyEffects))

        assertThat(read.scenes).hasSize(3)
        assertThat(read.layout).isEqualTo(MosaicLayoutMode.HERO)
    }

    @Test
    fun `a rich iOS scene keeps its stickers, its drawing and its sound`() {
        val read = requireNotNull(PostSceneReading.of(servedFixture("v1-legacy-rich.v3").storyEffects))

        val scene = read.scenes.single()
        assertThat(scene.stickerObjects.orEmpty()).isNotEmpty()
        assertThat(scene.drawingStrokes.orEmpty()).isNotEmpty()
        assertThat(scene.audioPlayerObjects.orEmpty()).isNotEmpty()
    }

    @Test
    fun `a served post of several scenes keeps them across its own re-encoding`() {
        val post = servedFixture("post-photo-scenes-3-hero")

        val replayed = json.decodeFromString(ApiPost.serializer(), json.encodeToString(ApiPost.serializer(), post))

        assertThat(PostSceneReading.of(replayed.storyEffects)?.scenes).hasSize(3)
        assertThat(PostSceneReading.of(replayed.storyEffects)?.layout).isEqualTo(MosaicLayoutMode.HERO)
    }

    @Test
    fun `the first scene stays readable by every consumer of the flat effects`() {
        val post = servedFixture("post-photo-scenes-2")

        assertThat(post.storyEffects?.mediaObjects.orEmpty().single { it.isBackground }.postMediaId).isEqualTo("64b000000000000000000001")
        assertThat((json.parseToJsonElement(json.encodeToString(ApiPost.serializer(), post)).jsonObject["storyEffects"] as JsonObject).keys)
            .contains("scenes")
    }
}
