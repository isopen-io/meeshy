package me.meeshy.app.stories

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.CanvasV3Migration
import me.meeshy.sdk.model.StoryEffects

/** Le blob `storyEffects` tel que la passerelle le tient, à l'octet : `null` dedans, la story n'en porte pas. */
@JvmInline
internal value class ServedStoryEffects(val json: JsonObject?)

/**
 * Ce que l'enregistrement d'une story modifiée écrit dans `storyEffects` (#13632).
 *
 * `PUT /posts/:id` REMPLACE le blob entier. Le modèle Android ne le lit pas sans perte : un document v3 d'iOS est rabattu
 * sur sa première scène, sans l'opacité d'un objet, l'ancre de bande d'un texte, le dessin PencilKit (`payload.data`), le
 * rythme d'un objet, ni les clés que ce build ne connaît pas. Réécrire la story depuis ce modèle effaçait donc, au premier
 * enregistrement, tout ce qu'Android ne sait pas dire — y compris quand l'auteur n'avait rien touché.
 *
 * L'écriture part donc du blob SERVI et n'y remplace QUE ce que l'auteur a changé : une fusion à trois voies entre le
 * servi, la forme qu'Android écrirait pour la story telle qu'elle s'est ouverte, et celle de la story telle qu'elle part.
 * Une valeur que le geste n'a pas changée reste celle du serveur, clés inconnues comprises ; une valeur qu'il a changée
 * prend la forme du composeur ; ce qu'il a retiré disparaît ; ce qu'Android ne sait pas représenter ne disparaît jamais.
 * Les listes d'objets se fusionnent par identifiant, les scènes par rang (Android n'édite que la première).
 */
internal object StoryEditDocument {

    private val v1 = Json { encodeDefaults = false; explicitNulls = false }

    private const val SCENES = "scenes"

    /** Une ancre est un tout : sa forme (`free` / `band`) décide de ce que valent ses coordonnées. */
    private val ATOMIC = setOf("anchor")

    /**
     * Le rang d'un objet qui existait reste le sien : le composeur ne réordonne pas la scène, et le rang qu'Android donne à
     * un objet sans rang propre (le fond, le dessin) n'est que sa place dans la liste — retirer un voisin le décalerait.
     */
    private const val RANK = "z"

    /** `null` : la composition n'a pas bougé, `storyEffects` ne part pas (une édition d'audience ne remet rien à zéro). */
    fun written(served: JsonObject?, opened: StoryEffects, edited: StoryEffects): JsonObject? {
        val canvas = served?.isCanvas() == true
        val carrier = served?.takeIf { canvas }?.carrierAspect()
        val before = encode(opened, canvas, carrier)
        val after = encode(edited, canvas, carrier)
        if (before == after) return null
        if (served == null) return after
        return merge(served, before, after, null) as? JsonObject ?: after
    }

    private fun encode(effects: StoryEffects, canvas: Boolean, carrier: Double?): JsonObject =
        if (canvas) {
            CanvasV3Migration.wireDocument(effects, carrier).withFirstScene()
        } else {
            v1.encodeToJsonElement(StoryEffects.serializer(), effects) as? JsonObject ?: JsonObject(emptyMap())
        }

    /**
     * Une composition vidée n'émet aucune scène (règle O3) : sans la sienne, la fusion lirait « la scène a disparu » et
     * emporterait avec elle ce qu'Android n'y représente pas (une pastille de mention, un objet d'un genre plus récent).
     */
    private fun JsonObject.withFirstScene(): JsonObject =
        if (this[SCENES] is JsonArray) this else JsonObject(this + (SCENES to JsonArray(listOf(EMPTY_SCENE))))

    private val EMPTY_SCENE = JsonObject(mapOf("id" to JsonPrimitive("s1"), "objects" to JsonArray(emptyList())))

    private fun JsonObject.isCanvas(): Boolean = ((this["v"] as? JsonPrimitive)?.intOrNull ?: 0) >= 3

    private fun JsonObject.carrierAspect(): Double? =
        ((this[SCENES] as? JsonArray)?.firstOrNull() as? JsonObject)
            ?.let { (it["carrierAspect"] as? JsonPrimitive)?.doubleOrNull }
            ?.takeIf { it > 0.0 }

    private fun merge(served: JsonElement?, before: JsonElement?, after: JsonElement?, field: String?): JsonElement? = when {
        after == before -> served
        after == null && served is JsonArray && before is JsonArray ->
            mergeArray(served, before, JsonArray(emptyList()), field).takeIf { it.isNotEmpty() }
        after == null -> null
        field == RANK && served != null -> served
        before == null || served == null || field in ATOMIC -> after
        served is JsonObject && before is JsonObject && after is JsonObject -> mergeObject(served, before, after)
        served is JsonArray && before is JsonArray && after is JsonArray -> mergeArray(served, before, after, field)
        else -> after
    }

    private fun mergeObject(served: JsonObject, before: JsonObject, after: JsonObject): JsonObject {
        val keys = served.keys + after.keys.filterNot { it in served }
        return JsonObject(
            keys.mapNotNull { key -> merge(served[key], before[key], after[key], key)?.let { key to it } }.toMap(),
        )
    }

    private fun mergeArray(served: JsonArray, before: JsonArray, after: JsonArray, field: String?): JsonArray {
        val key: (Int, JsonElement) -> String? = if (field == SCENES) { index, _ -> "#$index" } else { _, element -> element.id() }
        val servedById = served.keyed(key) ?: return after
        val beforeById = before.keyed(key) ?: return after
        val afterById = after.keyed(key) ?: return after
        val kept = servedById.mapNotNull { (id, element) -> merge(element, beforeById[id], afterById[id], null) }
        val added = afterById.filterKeys { it !in servedById }.mapNotNull { (id, element) -> merge(null, beforeById[id], element, null) }
        return JsonArray(kept + added)
    }

    private fun JsonElement.id(): String? = ((this as? JsonObject)?.get("id") as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** `null` : une liste dont un élément n'a pas d'identifiant (ou en partage un) ne se fusionne pas, elle se remplace. */
    private fun JsonArray.keyed(key: (Int, JsonElement) -> String?): Map<String, JsonElement>? {
        val pairs = mapIndexed { index, element -> key(index, element)?.let { it to element } }
        if (pairs.any { it == null }) return null
        val map = pairs.filterNotNull().toMap(LinkedHashMap())
        return map.takeIf { it.size == size }
    }
}
