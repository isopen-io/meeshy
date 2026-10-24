package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class StoryLocationObjectWireTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun v3(vararg objets: JsonObject, extra: String = "") =
        """{"v":3,"scenes":[{"id":"s","objects":[${objets.joinToString(",")}]$extra}]}"""

    private val pastille = """{"id":"L1","kind":"place","anchor":{"t":"free","x":0.3,"y":0.7},"plane":"content","z":4,
        "transform":{"scale":1.2,"rotation":10,"opacity":1},"timing":{"start":1.5},"locale":"fr",
        "payload":{"place":{"latitude":48.85,"longitude":2.35,"name":"Paris"},"styleId":"ticket","duration":2.5,"fadeIn":0.2,"fadeOut":0.3}}"""

    @Test
    fun `une pastille de lieu v3 garde son identite et sa fenetre de temps`() {
        val effets = json.decodeFromString(StoryEffectsWireSerializer, v3(json.parseToJsonElement(pastille) as JsonObject))
        val lieu = effets.locationObjects.single()
        assertThat(lieu.id).isEqualTo("L1")
        assertThat(lieu.place.name).isEqualTo("Paris")
        assertThat(lieu.styleId).isEqualTo("ticket")
        assertThat(lieu.sourceLanguage).isEqualTo("fr")
        assertThat(lieu.x).isEqualTo(0.3)
        assertThat(lieu.y).isEqualTo(0.7)
        assertThat(lieu.scale).isEqualTo(1.2)
        assertThat(lieu.rotation).isEqualTo(10.0)
        assertThat(lieu.zIndex).isEqualTo(4)
        assertThat(lieu.startTime).isEqualTo(1.5)
        assertThat(lieu.duration).isEqualTo(2.5)
        assertThat(lieu.fadeIn).isEqualTo(0.2)
        assertThat(lieu.fadeOut).isEqualTo(0.3)
    }

    @Test
    fun `la pastille survit a l aller retour v1`() {
        val effets = json.decodeFromString(StoryEffectsWireSerializer, v3(json.parseToJsonElement(pastille) as JsonObject))
        val wire = json.encodeToString(StoryEffects.serializer(), effets)
        val relu = json.decodeFromString(StoryEffectsWireSerializer, wire)
        assertThat(relu.locationObjects).isEqualTo(effets.locationObjects)
    }

    @Test
    fun `un ancien document sans pastille se decode avec une liste vide`() {
        assertThat(json.decodeFromString(StoryEffects.serializer(), "{}").locationObjects).isEmpty()
    }

    @Test
    fun `une pastille sans lieu lisible est ecartee sans perdre le reste`() {
        val casse = """{"id":"L2","kind":"place","payload":{}}"""
        val texte = """{"id":"t","kind":"text","payload":{"text":"ok"}}"""
        val effets = json.decodeFromString(
            StoryEffectsWireSerializer,
            v3(json.parseToJsonElement(casse) as JsonObject, json.parseToJsonElement(texte) as JsonObject),
        )
        assertThat(effets.locationObjects).isEmpty()
        assertThat(effets.textObjects).hasSize(1)
    }

    @Test
    fun `un kind inconnu est conserve verbatim et la scene le declare non peignable`() {
        val futur = """{"id":"p1","kind":"poll","payload":{"question":"?"}}"""
        val effets = json.decodeFromString(StoryEffectsWireSerializer, v3(json.parseToJsonElement(futur) as JsonObject))
        assertThat(effets.carriesUnpaintableContent).isTrue()
        assertThat(effets.unpaintableKinds).containsExactly("poll")
        val garde = effets.unpaintableObjects.single()
        assertThat(garde.id).isEqualTo("p1")
        assertThat(garde.payload["question"]).isEqualTo(JsonPrimitive("?"))
    }

    @Test
    fun `une mention est connue et ne compte pas comme une rupture`() {
        val mention = """{"id":"m1","kind":"mention","payload":{"userId":"u"}}"""
        val effets = json.decodeFromString(StoryEffectsWireSerializer, v3(json.parseToJsonElement(mention) as JsonObject))
        assertThat(effets.carriesUnpaintableContent).isFalse()
        assertThat(effets.unpaintableObjects.map { it.id }).containsExactly("m1")
    }

    @Test
    fun `une scene sans objet inconnu ne porte rien d impeignable`() {
        assertThat(StoryEffects().carriesUnpaintableContent).isFalse()
        val vide = buildJsonObject { put("v", 3) }
        assertThat(json.decodeFromString(StoryEffectsWireSerializer, vide.toString()).carriesUnpaintableContent).isFalse()
    }
}
