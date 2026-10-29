package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import me.meeshy.app.stories.StoryEditFixtures.FOREGROUND_PHOTO
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.CanvasV3Migration
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryEffectsWireSerializer
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.net.api.UpdatePostRequest
import org.junit.Test

/**
 * Une story publiée par iOS, rouverte et enregistrée sur Android, ne perd RIEN de ce que l'auteur n'a pas touché (#13632) :
 * la route remplace le blob entier, et le modèle Android ne sait pas tout en dire.
 */
class StoryEditDocumentTest {

    private val production = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = false }

    private val canvasOpening = StoryEditFixtures.opening(StoryEditFixtures.iosCanvasPost)
    private val canvasOpened = StoryEditFixtures.opened(canvasOpening)
    private val served = asWritten(StoryEditFixtures.served(StoryEditFixtures.iosCanvas).json!!)

    /** Le fil réécrit un nombre sous sa forme canonique (`1700000000.5` → `1.7000000005E9`) : la valeur, pas l'écriture. */
    private fun asWritten(document: JsonObject): JsonObject = production.encodeToJsonElement(JsonObject.serializer(), document).jsonObject

    private fun request(state: StoryComposerUiState, opening: StoryEditOpening = canvasOpening): JsonObject {
        val plan = StoryEditMerge.plan(opening, state, "fr") as StoryEditPlan.Ready
        return production.encodeToJsonElement(UpdatePostRequest.serializer(), plan.request).jsonObject
    }

    private fun written(state: StoryComposerUiState, opening: StoryEditOpening = canvasOpening): JsonObject =
        request(state, opening)["storyEffects"]!!.jsonObject

    private fun edited(state: StoryComposerUiState, change: (StorySlide) -> StorySlide): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        return state.copy(deck = StorySlideDeck(listOf(change(slide)), slide.id)).mirrorDraftToSelection()
    }

    private fun renamed(state: StoryComposerUiState, id: String, text: String) = edited(state) { slide ->
        slide.copy(elements = slide.elements.map { if (it.id == id) it.copy(text = text) else it })
    }

    private fun JsonObject.scene(index: Int): JsonObject = this["scenes"]!!.jsonArray[index].jsonObject

    private fun JsonObject.objectNamed(id: String): JsonObject? =
        scene(0)["objects"]!!.jsonArray.map { it.jsonObject }.firstOrNull { it["id"] == JsonPrimitive(id) }

    @Test
    fun `sans geste la composition ne part pas, et rien n'est remis a zero`() {
        val request = request(canvasOpened)

        assertThat(request.containsKey("storyEffects")).isFalse()
        assertThat(request.containsKey("content")).isFalse()
        assertThat(request.containsKey("mediaIds")).isFalse()
    }

    @Test
    fun `une edition d'audience seule n'envoie que l'audience`() {
        val request = request(canvasOpened.copy(draft = canvasOpened.draft.withVisibility(StoryVisibility.PRIVATE)))

        assertThat(request.keys).containsExactly("visibility")
        assertThat(request["visibility"]).isEqualTo(JsonPrimitive("PRIVATE"))
    }

    @Test
    fun `changer les mots d'un texte laisse tout le reste du document a l'octet`() {
        val document = written(renamed(canvasOpened, "t2", "Bonsoir"))

        assertThat(document.scene(1)).isEqualTo(served.scene(1))
        assertThat(document["sound"]).isEqualTo(served["sound"])
        assertThat(document["layout"]).isEqualTo(served["layout"])
        assertThat(document["futureDocumentKey"]).isEqualTo(served["futureDocumentKey"])
        assertThat(document.scene(0)["futureSceneKey"]).isEqualTo(JsonPrimitive("garde"))
        listOf("bg", "t1", "fg1", "st2", "drawing", "pastille").forEach { id ->
            assertThat(document.objectNamed(id)).isEqualTo(served.objectNamed(id))
        }
    }

    @Test
    fun `le texte renomme garde son ancre de bande et perd ses traductions perimees`() {
        val t2 = written(renamed(canvasOpened, "t2", "Bonsoir")).objectNamed("t2")!!

        assertThat(t2["payload"]!!.jsonObject["text"]).isEqualTo(JsonPrimitive("Bonsoir"))
        assertThat(t2["payload"]!!.jsonObject.containsKey("translations")).isFalse()
        assertThat(t2["anchor"]).isEqualTo(served.objectNamed("t2")!!["anchor"])
        assertThat(t2["locale"]).isEqualTo(JsonPrimitive("fr"))
    }

    @Test
    fun `deplacer un texte ne lui retire ni opacite, ni rythme, ni traductions, ni ce que ce build ignore`() {
        val moved = edited(canvasOpened) { slide ->
            slide.copy(elements = slide.elements.map { if (it.id == "t1") it.copy(x = 0.6f) else it })
        }

        val t1 = written(moved).objectNamed("t1")!!
        val payload = t1["payload"]!!.jsonObject
        val original = served.objectNamed("t1")!!["payload"]!!.jsonObject

        assertThat(t1["transform"]!!.jsonObject["opacity"]).isEqualTo(JsonPrimitive(0.5))
        assertThat(t1["timing"]!!.jsonObject["rate"]).isEqualTo(JsonPrimitive(2))
        listOf("name", "referenceUserId", "futureTextKey", "translations", "textEffect", "textStyle", "fontSize").forEach { key ->
            assertThat(payload[key]).isEqualTo(original[key])
        }
        assertThat((t1["anchor"]!!.jsonObject["x"] as JsonPrimitive).content.toDouble()).isWithin(0.001).of(0.6)
    }

    @Test
    fun `retirer la photo posee ne retire qu'elle du document`() {
        val state = canvasOpened.copy(
            deck = canvasOpened.deck.removeMedia(FOREGROUND_PHOTO),
            attachments = canvasOpened.attachments.filterNot { it.id == FOREGROUND_PHOTO },
        ).mirrorDraftToSelection()

        val document = written(state)

        assertThat(document.objectNamed("fg1")).isNull()
        listOf("bg", "t1", "t2", "st2", "drawing", "pastille").forEach { id ->
            assertThat(document.objectNamed(id)).isEqualTo(served.objectNamed(id))
        }
        assertThat(document.scene(1)).isEqualTo(served.scene(1))
    }

    @Test
    fun `une story ecrite en v1 reste v1 et garde les cles que le modele ignore`() {
        val legacy = StoryEditFixtures.iosEffects.replaceFirst("{", """{ "drawingData": "UEtE", "futureRootKey": [1, 2],""")
            .replaceFirst("\"id\": \"t1\",", "\"id\": \"t1\", \"futureTextKey\": \"garde\",")
        val post = StoryEditFixtures.iosPost
        val opening = StoryEditFixtures.opening(post, served = StoryEditFixtures.served(legacy))
        val servedLegacy = asWritten(StoryEditFixtures.served(legacy).json!!)

        val document = written(renamed(StoryEditFixtures.opened(opening), "t2", "Bonsoir"), opening)

        assertThat(document.containsKey("v")).isFalse()
        assertThat(document["drawingData"]).isEqualTo(JsonPrimitive("UEtE"))
        assertThat(document["futureRootKey"]).isEqualTo(servedLegacy["futureRootKey"])
        val texts = document["textObjects"]!!.jsonArray.map { it.jsonObject }
        assertThat(texts.first { it["id"] == JsonPrimitive("t1") }).isEqualTo(servedLegacy["textObjects"]!!.jsonArray[0])
        assertThat(texts.first { it["id"] == JsonPrimitive("t2") }["text"]).isEqualTo(JsonPrimitive("Bonsoir"))
    }

    @Test
    fun `sur une scene letterboxee un texte deplace se relit a la place ou l'auteur l'a pose`() {
        val boxed = StoryEditFixtures.iosCanvas.replaceFirst("\"id\": \"s1\",", "\"id\": \"s1\", \"carrierAspect\": 1.0,")
        val post = StoryEditFixtures.canvasPost(boxed)
        val opening = StoryEditFixtures.opening(post, served = StoryEditFixtures.served(boxed))
        val moved = edited(StoryEditFixtures.opened(opening)) { slide ->
            slide.copy(elements = slide.elements.map { if (it.id == "t1") it.copy(y = 0.7f) else it })
        }

        val document = written(moved, opening)
        val reread = production.decodeFromJsonElement(StoryEffectsWireSerializer, document)

        assertThat(document.scene(0)["carrierAspect"]).isEqualTo(JsonPrimitive(1.0))
        assertThat(reread.textObjects.first { it.id == "t1" }.y).isWithin(0.001).of(0.7)
        assertThat(document.objectNamed("st2")).isEqualTo(asWritten(StoryEditFixtures.served(boxed).json!!).objectNamed("st2"))
    }

    @Test
    fun `la fusion garde ce que la composition ne represente pas et ne ressuscite pas ce que l'auteur a retire`() {
        fun json(text: String): JsonObject = production.parseToJsonElement(text) as JsonObject
        val serverOnly = json("""{"v":3,"scenes":[{"id":"s1","objects":[{"id":"a","kind":"text","payload":{"text":"x","k":1}},{"id":"m","kind":"mention"}]}]}""")
        val opened = StoryEffects(textObjects = listOf(me.meeshy.sdk.model.StoryTextObject(id = "a", text = "x")))

        val removed = StoryEditDocument.written(serverOnly, opened, StoryEffects())!!

        val ids = removed.scene(0)["objects"]!!.jsonArray.map { (it.jsonObject["id"] as JsonElement) }
        assertThat(ids).containsExactly(JsonPrimitive("m"))
        assertThat(StoryEditDocument.written(serverOnly, opened, opened)).isNull()
        assertThat(removed["scenes"]).isInstanceOf(JsonArray::class.java)
    }

    @Test
    fun `regler le fond d'une story v3 ecrit ses reglages dans l'objet de fond et garde son cadrage`() {
        val ios = StoryEditFixtures.iosPost
        val document = CanvasV3Migration.wireDocument(ios.storyEffects!!)
        val post = ios.copy(storyEffects = production.decodeFromJsonElement(StoryEffectsWireSerializer, document))
        val opening = StoryEditFixtures.opening(post, served = ServedStoryEffects(document))
        val tuned = ImageAdjustments().with(AdjustmentKind.BRIGHTNESS, 0.3f)
        val state = edited(StoryEditFixtures.opened(opening)) { it.copy(backgroundAdjustments = tuned) }

        val body = written(state, opening)

        fun JsonObject.background(): JsonObject = scene(0)["objects"]!!.jsonArray.map { it.jsonObject }
            .first { (it["payload"] as? JsonObject)?.get("isBackground") == JsonPrimitive(true) }
        val before = asWritten(document).background()
        val after = body.background()
        assertThat(after["payload"]!!.jsonObject["adjustments"]!!.jsonObject["brightness"]).isEqualTo(JsonPrimitive(0.3))
        assertThat(after["anchor"]).isEqualTo(before["anchor"])
        assertThat(after["transform"]).isEqualTo(before["transform"])
    }
}
