package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostStoryEffectsWireSerializer
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

/**
 * #13863 R3 : un post ou un réel composé sur la scène part en UN document de scènes (le v3 qu'iOS publie et que le fil
 * relit) ; un post qui ne porte que son texte, sans objet ni fond, reste le post texte d'avant.
 */
class ScenePostDocumentTest {
    @Serializable
    private data class Body(@Serializable(with = PostStoryEffectsWireSerializer::class) val storyEffects: StoryEffects? = null)

    private val json = Json { encodeDefaults = false; explicitNulls = false; ignoreUnknownKeys = true }

    private val sticker = StoryEffects(stickerObjects = listOf(StorySticker(id = "k", emoji = "🔥", x = 0.4, y = 0.6)))
    private val photo = StoryEffects(
        mediaObjects = listOf(StoryMediaObject(id = "m1", postMediaId = "p1", mediaType = "image", isBackground = true)),
        textObjects = listOf(StoryTextObject(id = "t", text = "salut", x = 0.5, y = 0.5)),
    )

    @Test
    fun `a post that carries only its text has no scene to publish`() {
        assertThat(ScenePostDocument.effects(emptyList(), null, ComposerFormat.POST)).isNull()
        assertThat(ScenePostDocument.effects(listOf(null, StoryEffects()), null, ComposerFormat.POST)).isNull()
    }

    @Test
    fun `a scene with one sticker publishes a one scene document`() {
        val effects = requireNotNull(ScenePostDocument.effects(listOf(sticker), MosaicLayoutMode.HERO, ComposerFormat.POST))

        val document = json.parseToJsonElement(json.encodeToString(Body(effects))).jsonObject.getValue("storyEffects").jsonObject

        assertThat(document["v"]!!.jsonPrimitive.int).isEqualTo(3)
        assertThat(document["scenes"]!!.jsonArray).hasSize(1)
        assertThat(document.keys).doesNotContain("layout")
    }

    @Test
    fun `every composed slide becomes a scene of the one document, with the armed layout for a post`() {
        val effects = requireNotNull(ScenePostDocument.effects(listOf(photo, StoryEffects(), sticker), MosaicLayoutMode.WAVE, ComposerFormat.POST))

        val canvas = requireNotNull(effects.canvas)

        assertThat(canvas.scenes).hasSize(2)
        assertThat(canvas.layout).isEqualTo(MosaicLayoutMode.WAVE)
        assertThat(effects).isEqualTo(StoryEffects(canvas = canvas))
    }

    @Test
    fun `a reel carries its scenes but never a layout`() {
        val effects = requireNotNull(ScenePostDocument.effects(listOf(photo, sticker), MosaicLayoutMode.WAVE, ComposerFormat.REEL))

        assertThat(effects.canvas?.scenes).hasSize(2)
        assertThat(effects.canvas?.layout).isNull()
    }

    @Test
    fun `the queued payload read back by the outbox keeps the one scene document, never a v1 rewrite`() {
        val effects = requireNotNull(ScenePostDocument.effects(listOf(sticker), null, ComposerFormat.POST))
        val written = json.encodeToString(Body(effects))

        val replayed = json.encodeToString(json.decodeFromString<Body>(written))

        assertThat(json.parseToJsonElement(replayed)).isEqualTo(json.parseToJsonElement(written))
    }

    @Test
    fun `a post whose one scene is only its colour leaves as the colour post the feed composer sent`() {
        val colour = StoryEffects(background = "302B63", timelineDuration = 5.0)

        assertThat(ScenePostDocument.effects(listOf(colour), null, ComposerFormat.POST)).isEqualTo(StoryEffects(background = "302B63"))
    }
}
