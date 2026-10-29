package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class StoryEditEffectsWireSerializerTest {

    @Serializable
    private data class Holder(
        @Serializable(with = StoryEditEffectsWireSerializer::class)
        val storyEffects: StoryEffects,
    )

    private val production = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private fun written(effects: StoryEffects): JsonObject =
        production.encodeToJsonElement(Holder.serializer(), Holder(effects)).jsonObject["storyEffects"] as JsonObject

    @Test
    fun `sans document de scene la charge garde le fil v1 de createStory`() {
        val wire = written(StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "Salut")), filter = "vintage"))

        assertThat(wire.containsKey("v")).isFalse()
        assertThat(wire["filter"]).isEqualTo(JsonPrimitive("vintage"))
        assertThat(wire["textObjects"]!!.jsonArray).hasSize(1)
    }

    @Test
    fun `un document de scene part tel quel, objets inconnus compris`() {
        val mention = ObjectV3(id = "pastille", kind = "mention")
        val canvas = CanvasV3Migration.migrate(StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "Salut"))))
            .let { it.copy(scenes = it.scenes.map { scene -> scene.copy(objects = scene.objects + mention) }) }

        val wire = written(StoryEffects(canvas = canvas))

        assertThat(wire["v"]).isEqualTo(JsonPrimitive(3))
        assertThat(wire["scenes"]!!.jsonArray.single().jsonObject["objects"]!!.jsonArray.map { it.jsonObject["kind"] }).contains(JsonPrimitive("mention"))
    }

    @Test
    fun `la lecture est celle de createStory`() {
        val read = production.decodeFromString(Holder.serializer(), """{"storyEffects":{"filter":"warm","textObjects":[{"id":"t","text":"x"}]}}""")

        assertThat(read.storyEffects.filter).isEqualTo("warm")
        assertThat(read.storyEffects.textObjects.single().id).isEqualTo("t")
    }
}
