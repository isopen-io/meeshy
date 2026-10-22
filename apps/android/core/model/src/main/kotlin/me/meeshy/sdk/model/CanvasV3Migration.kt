package me.meeshy.sdk.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/**
 * Le pont d'ÉCRITURE : `storyEffects` v1 → document canvas v3, et son inverse.
 *
 * Miroir strict de `services/gateway/src/services/posts/storyEffectsV3.ts`
 * (`convertV1ToV3`) et de `CanvasV3Migration.swift`. Le juge est la paire de
 * fixtures partagées `packages/shared/fixtures/canvas-v3/` (`X.json` ⇄ `X.v3.json`).
 *
 * Le convertisseur travaille sur le JSON v1, comme celui de la passerelle : les
 * charges se RÉPANDENT (`rest`) au lieu d'être recomposées clé par clé, si bien
 * qu'une clé ajoutée en amont voyage sans qu'un inventaire à la main la retienne.
 * Le modèle typé [StoryEffects] n'a qu'à s'encoder (voir [migrate]).
 *
 * Android publie toujours en v1 : ce pont n'est branché sur aucun envoi. Il
 * existe pour que le jour où `X-Canvas-Caps: 3` sera annoncé, ce que l'on
 * publie reste lisible partout sans perte.
 */
public object CanvasV3Migration {

    /** Le plafond du contrat (`scenes.min(1).max(10)`), tenu AVANT le fil. */
    public const val MAX_SCENES: Int = 10

    private const val SCENE_ASPECT = 9.0 / 16.0
    private const val BAND_TOP_Y = 0.08
    private const val BAND_BOTTOM_Y = 0.92

    private val wireJson = Json { encodeDefaults = false; explicitNulls = false }
    private val readJson = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private val ENVELOPE = setOf(
        "id", "x", "y", "scale", "rotation", "opacity", "zIndex",
        "startTime", "endTime", "keyframes", "sourceLanguage",
    )

    /** Résultat de l'inverse : le blob v1 et ce que v1 ne sait pas exprimer. */
    public data class V1Wire(
        val effects: JsonObject,
        /** `id → "top" | "bottom"` des objets ancrés sur une bande. */
        val bandEdges: Map<String, String>,
        /** Objets d'un kind que le runtime v1 ne peint pas, à réémettre tels quels. */
        val preserved: List<JsonObject>,
    )

    // MARK: - Aides JSON

    private fun JsonObject.str(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotEmpty() }?.content

    private fun JsonElement?.number(): Double? =
        (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

    private fun JsonObject.isNumber(key: String): Boolean = this[key].number() != null

    private fun JsonObject.withoutKeys(keys: Set<String>): JsonObject =
        JsonObject(filterKeys { it !in keys })

    private fun JsonElement?.objectWithKeys(): JsonObject? = (this as? JsonObject)?.takeIf { it.isNotEmpty() }

    private fun JsonElement?.objects(): List<JsonObject> =
        (this as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

    private fun isPivot(v: JsonElement?): Boolean =
        v is JsonObject && v["x"].number() != null && v["y"].number() != null

    private fun isStringMap(v: JsonElement?): Boolean =
        v is JsonObject && v.isNotEmpty() && v.values.all { it is JsonPrimitive && it.isString }

    private fun anchorOf(x: Double, y: Double): JsonObject = buildJsonObject {
        put("t", "free")
        put("x", x)
        put("y", y)
    }

    private fun JsonObject.anchorObject(): JsonObject? = this["anchor"] as? JsonObject

    // MARK: - Letterbox des ancres

    /** `y' = top + y·h` (porteur plus large que la scène) ou l'équivalent en x. */
    public fun remapFree(x: Double, y: Double, carrierAspect: Double): Pair<Double, Double> {
        if (!carrierAspect.isFinite() || carrierAspect <= 0.0) return x to y
        if (carrierAspect > SCENE_ASPECT) {
            val h = SCENE_ASPECT / carrierAspect
            val top = (1 - h) / 2
            return x to (top + y * h)
        }
        if (carrierAspect < SCENE_ASPECT) {
            val w = carrierAspect / SCENE_ASPECT
            val left = (1 - w) / 2
            return (left + x * w) to y
        }
        return x to y
    }

    /** L'inverse exact de [remapFree] : `y = (y' − top) / h`. */
    public fun unmapFree(x: Double, y: Double, carrierAspect: Double): Pair<Double, Double> {
        if (!carrierAspect.isFinite() || carrierAspect <= 0.0) return x to y
        if (carrierAspect > SCENE_ASPECT) {
            val h = SCENE_ASPECT / carrierAspect
            val top = (1 - h) / 2
            return x to ((y - top) / h)
        }
        if (carrierAspect < SCENE_ASPECT) {
            val w = carrierAspect / SCENE_ASPECT
            val left = (1 - w) / 2
            return ((x - left) / w) to y
        }
        return x to y
    }

    // MARK: - v1 → v3

    private fun baseObject(
        o: JsonObject,
        kind: String,
        plane: String,
        fallbackZ: Int,
        payload: JsonObject,
        bandEdge: String? = null,
    ): JsonObject {
        val start = o["startTime"].number()
        val end = o["endTime"].number()
        val inverted = start != null && end != null && end < start
        val timing = buildJsonObject {
            if (start != null && !inverted) put("start", start)
            if (end != null && !inverted) put("end", end)
            (o["keyframes"] as? JsonArray)?.let { put("keyframes", it) }
        }
        val locale = o.str("sourceLanguage")
        val anchor = if (bandEdge != null) {
            buildJsonObject { put("t", "band"); put("edge", bandEdge) }
        } else {
            anchorOf(o.num("x", 0.5), o.num("y", 0.5))
        }
        return buildJsonObject {
            put("id", o.str("id") ?: "$kind-$fallbackZ")
            put("kind", kind)
            put("anchor", anchor)
            put("plane", plane)
            put("z", if (o.isNumber("zIndex")) o["zIndex"]!! else JsonPrimitive(fallbackZ))
            put("transform", buildJsonObject {
                put("scale", o.num("scale", 1.0))
                put("rotation", o.num("rotation", 0.0))
                put("opacity", o.num("opacity", 1.0))
            })
            if (timing.isNotEmpty()) put("timing", timing)
            if (locale != null) put("locale", locale)
            put("payload", payload)
        }
    }

    private fun mediaPayload(m: JsonObject): JsonObject {
        val volume = m["volume"].number()
        val muted = (m["isMuted"] as? JsonPrimitive)?.booleanOrNull
            ?: (m["muted"] as? JsonPrimitive)?.booleanOrNull
            ?: volume?.let { it <= 0.0 }
        val rest = m.withoutKeys(
            ENVELOPE + setOf("isMuted", "muted", "volume", "anchor", "postMediaId", "mediaURL", "mediaType"),
        )
        return JsonObject(
            buildMap<String, JsonElement> {
                putAll(rest)
                put("postMediaId", (m["postMediaId"]?.takeUnless { it is JsonNull }) ?: JsonNull)
                m.str("mediaURL")?.let { put("mediaURL", JsonPrimitive(it)) }
                m.str("mediaType")?.let { put("mediaType", JsonPrimitive(it)) }
                if (volume != null) put("volume", JsonPrimitive(volume))
                if (muted != null) put("muted", JsonPrimitive(muted))
                if (isPivot(m["anchor"])) put("anchor", m["anchor"]!!)
            },
        )
    }

    private fun audioPayload(a: JsonObject): JsonObject {
        val rest = a.withoutKeys(
            ENVELOPE + setOf("postMediaId", "mediaURL", "placement", "volume", "waveformSamples", "backgroundAudioVariants"),
        )
        val volume = a["volume"].number()
        val waveform = a["waveformSamples"] as? JsonArray
        val variants = (a["backgroundAudioVariants"] as? JsonArray)?.takeIf { it.isNotEmpty() }
        return JsonObject(
            buildMap<String, JsonElement> {
                putAll(rest)
                put("postMediaId", a.str("postMediaId")?.let { JsonPrimitive(it) } ?: JsonNull)
                put("mediaURL", a["mediaURL"] ?: JsonNull)
                put("placement", a["placement"] ?: JsonNull)
                if (volume != null && volume != 1.0) put("volume", JsonPrimitive(volume))
                if (waveform != null && waveform.isNotEmpty()) put("waveformSamples", waveform)
                if (variants != null) put("variants", variants)
            },
        )
    }

    private fun stickerPayload(st: JsonObject): JsonObject {
        val rest = st.withoutKeys(ENVELOPE + "slots")
        return JsonObject(
            buildMap<String, JsonElement> {
                putAll(rest)
                if (isStringMap(st["slots"])) put("slots", st["slots"]!!)
            },
        )
    }

    private fun locationPayload(l: JsonObject): JsonObject {
        val rest = l.withoutKeys(ENVELOPE + "place")
        return JsonObject(
            buildMap<String, JsonElement> {
                putAll(rest)
                put("place", l["place"]?.takeUnless { it is JsonNull } ?: JsonNull)
            },
        )
    }

    private fun legacyTextObject(blob: JsonObject, content: String?): JsonObject? {
        val text = content?.takeIf { it.isNotEmpty() } ?: return null
        val styled = blob.str("textStyle") != null || blob.str("textColor") != null || blob.isNumber("textPosition")
        if (!styled) return null
        return buildJsonObject {
            put("text", text)
            blob.str("textStyle")?.let { put("textStyle", it) }
            blob.str("textColor")?.let { put("textColor", it) }
        }
    }

    /**
     * Une slide v1 → une scène v3, ou `null` quand elle ne porte rien (règle O3).
     *
     * [bandEdges] rend aux objets leur ancre de bande (le blob v1 ne la porte pas),
     * [preserved] réémet verbatim les objets que v1 ne peint pas — déjà en
     * coordonnées fil, donc ajoutés APRÈS le letterbox.
     */
    public fun convertScene(
        blob: JsonObject,
        id: String = "s1",
        content: String? = null,
        bandEdges: Map<String, String> = emptyMap(),
        preserved: List<JsonObject> = emptyList(),
    ): JsonObject? {
        val objects = mutableListOf<JsonObject>()
        var z = 0
        fun edge(o: JsonObject) = o.str("id")?.let { bandEdges[it] }

        val bgTransform = blob["backgroundTransform"].objectWithKeys()
        val bgColor = blob.str("background")
        if (bgColor != null || bgTransform != null) {
            val payload = buildJsonObject {
                if (bgColor != null) put("background", bgColor)
                put("transform", bgTransform ?: JsonNull)
            }
            objects += baseObject(buildJsonObject { put("id", "bg") }, "media", "bg", z++, payload)
        }

        val textObjects = blob["textObjects"].objects()
        for (t in textObjects) {
            objects += baseObject(t, "text", "fg", z++, t.withoutKeys(ENVELOPE), edge(t))
        }
        if (textObjects.isEmpty()) {
            legacyTextObject(blob, content)?.let { payload ->
                val seed = buildJsonObject {
                    put("id", "legacy-text")
                    put("y", blob.num("textPosition", 0.5))
                }
                objects += baseObject(seed, "text", "fg", z++, payload)
            }
        }
        for (m in blob["mediaObjects"].objects()) {
            objects += baseObject(m, "media", "content", z++, mediaPayload(m), edge(m))
        }
        for (st in blob["stickerObjects"].objects()) {
            objects += baseObject(st, "sticker", "fg", z++, stickerPayload(st), edge(st))
        }
        for (emoji in (blob["stickers"] as? JsonArray).orEmpty()) {
            val value = (emoji as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotEmpty() } ?: continue
            objects += baseObject(JsonObject(emptyMap()), "sticker", "fg", z++, buildJsonObject { put("emoji", value.content) })
        }

        val strokes = (blob["drawingStrokes"] as? JsonArray).orEmpty()
        val drawingData = blob.str("drawingData")
        if (strokes.isNotEmpty() || drawingData != null) {
            val payload = buildJsonObject {
                if (strokes.isNotEmpty()) put("strokes", JsonArray(strokes))
                if (drawingData != null) put("data", drawingData)
            }
            objects += baseObject(buildJsonObject { put("id", "drawing") }, "drawing", "fg", z++, payload)
        }
        for (l in blob["locationObjects"].objects()) {
            objects += baseObject(l, "place", "fg", z++, locationPayload(l), edge(l))
        }
        for (a in blob["audioPlayerObjects"].objects()) {
            objects += baseObject(a, "audio", "content", z++, audioPayload(a), edge(a))
        }

        applySlideFilter(objects, blob)

        val carrier = blob["canvasAspectRatio"].number()
        val remapped = if (carrier == null) objects else objects.map { remapObject(it, carrier) }
        val known = remapped.mapNotNull { (it["id"] as? JsonPrimitive)?.content }.toSet()
        val finalObjects = remapped + preserved.filter { (it["id"] as? JsonPrimitive)?.content !in known }

        val thumbHash = blob.str("thumbHash")
        val timelineDuration = blob["timelineDuration"].number()
        val opening = blob["opening"] as? JsonObject
        val closing = blob["closing"] as? JsonObject
        val clipTransitions = blob["clipTransitions"] as? JsonArray
        val carries = finalObjects.isNotEmpty() || thumbHash != null || timelineDuration != null ||
            opening != null || closing != null || !clipTransitions.isNullOrEmpty()
        if (!carries) return null
        return buildJsonObject {
            put("id", id)
            put("objects", JsonArray(finalObjects))
            if (carrier != null && carrier > 0.0) put("carrierAspect", carrier)
            if (timelineDuration != null) put("timelineDuration", timelineDuration)
            if (opening != null) put("opening", opening)
            if (closing != null) put("closing", closing)
            if (clipTransitions != null) put("clipTransitions", clipTransitions)
            if (thumbHash != null) put("thumbHash", thumbHash)
        }
    }

    private fun JsonObject.payloadObject(): JsonObject = (this["payload"] as? JsonObject) ?: JsonObject(emptyMap())

    private fun JsonObject.kindName(): String? = (this["kind"] as? JsonPrimitive)?.content

    private fun JsonObject.planeName(): String? = (this["plane"] as? JsonPrimitive)?.content

    private fun JsonObject.replacing(key: String, value: JsonElement): JsonObject =
        JsonObject(toMutableMap().also { it[key] = value })

    /** Le filtre de SLIDE est celui du FOND ; il ne se replie sur un média posé que sans fond. */
    private fun applySlideFilter(objects: MutableList<JsonObject>, blob: JsonObject) {
        val filter = blob.str("filter") ?: return
        val index = objects.indexOfFirst {
            it.kindName() == "media" && (it.payloadObject()["isBackground"] as? JsonPrimitive)?.booleanOrNull == true
        }.takeIf { it >= 0 }
            ?: objects.indexOfFirst { it.kindName() == "media" && it.planeName() == "bg" }.takeIf { it >= 0 }
            ?: objects.indexOfFirst {
                it.kindName() == "media" && it.planeName() == "content" && it.payloadObject().str("filter") == null
            }.takeIf { it >= 0 }
            ?: return
        val payload = JsonObject(
            buildMap<String, JsonElement> {
                putAll(objects[index].payloadObject())
                put("filter", JsonPrimitive(filter))
                blob["filterIntensity"].number()?.let { put("filterIntensity", JsonPrimitive(it)) }
            },
        )
        objects[index] = objects[index].replacing("payload", payload)
    }

    private fun remapObject(o: JsonObject, carrier: Double): JsonObject {
        if (o.planeName() == "bg" || o.kindName() == "media") return o
        val anchor = o["anchor"] as? JsonObject ?: return o
        if ((anchor["t"] as? JsonPrimitive)?.content != "free") return o
        val (x, y) = remapFree(anchor.num("x", 0.5), anchor.num("y", 0.5), carrier)
        return o.replacing("anchor", anchorOf(x, y))
    }

    /** Le son appartient au DOCUMENT, jamais à une scène. */
    public fun convertSound(blob: JsonObject): JsonObject? {
        val transcriptions = blob["voiceTranscriptions"].objects().mapNotNull { t ->
            val language = t.str("language")
            val content = (t["content"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (language != null && content != null) buildJsonObject { put("language", language); put("content", content) } else null
        }
        val variants = blob["backgroundAudioVariants"].objects().mapNotNull { v ->
            val postMediaId = v.str("postMediaId")
            val language = v.str("language")
            if (postMediaId == null || language == null) return@mapNotNull null
            buildJsonObject {
                put("postMediaId", postMediaId)
                put("language", language)
                put("isAutoGenerated", (v["isAutoGenerated"] as? JsonPrimitive)?.booleanOrNull != false)
            }
        }
        val soundId = blob.str("backgroundAudioId")
        val own = blob.str("voiceAttachmentId")
        if (soundId == null && own == null && transcriptions.isEmpty()) return null
        val start = blob["backgroundAudioStart"].number()
        val end = blob["backgroundAudioEnd"].number()
        return buildJsonObject {
            put("source", buildJsonObject {
                if (soundId != null) { put("t", "library"); put("soundId", soundId) } else put("t", "original")
            })
            put("volume", if (soundId != null || own != null) blob.num("backgroundAudioVolume", 1.0) else 1.0)
            if (start != null && end != null && end >= start) {
                put("bounds", buildJsonObject { put("start", start); put("end", end) })
            }
            if (transcriptions.isNotEmpty()) put("transcriptions", JsonArray(transcriptions))
            if (variants.isNotEmpty()) put("variants", JsonArray(variants))
        }
    }

    /**
     * Une publication de [slides] v1 → un document : une scène par slide (O3 par
     * slide, ids `s1`…`sN`, dix au plus), UNE bande-son — la première trouvée.
     */
    public fun convertDocument(
        slides: List<JsonObject>,
        content: String? = null,
        layout: MosaicLayoutMode? = null,
    ): JsonObject {
        val scenes = slides.take(MAX_SCENES).mapIndexedNotNull { index, blob ->
            convertScene(blob, id = "s${index + 1}", content = content.takeIf { index == 0 })
        }
        val sound = slides.firstNotNullOfOrNull { convertSound(it) }
        return buildJsonObject {
            put("v", 3)
            if (scenes.isNotEmpty()) put("scenes", JsonArray(scenes))
            if (sound != null) put("sound", sound)
            if (layout != null) {
                put("layout", JsonPrimitive(layout.wireName))
            }
        }
    }

    /** Convertit un blob v1 (une slide) — l'équivalent de `convertV1ToV3`. */
    public fun convert(blob: JsonObject, content: String? = null): JsonObject = convertDocument(listOf(blob), content)

    /**
     * Le chemin du modèle typé : [effects] s'encode (défauts omis, comme iOS), le
     * ratio du porteur d'origine [carrierAspect] — que le modèle Android ne porte
     * pas — letterboxe les ancres libres.
     */
    public fun migrate(
        effects: StoryEffects,
        carrierAspect: Double? = null,
        content: String? = null,
    ): CanvasV3 {
        val encoded = wireJson.encodeToJsonElement(StoryEffects.serializer(), effects) as? JsonObject
            ?: JsonObject(emptyMap())
        val blob = JsonObject(
            buildMap<String, JsonElement> {
                putAll(stripKeyframeIds(JsonObject(encoded - "layout")))
                if (carrierAspect != null) put("canvasAspectRatio", JsonPrimitive(carrierAspect))
            },
        )
        val document = convertDocument(listOf(blob), content, effects.layout)
        return readJson.decodeFromJsonElement(CanvasV3.serializer(), document)
    }

    /** `StoryKeyframe.id` est synthétisé à la lecture : le fil n'en a jamais porté. */
    private fun stripKeyframeIds(blob: JsonObject): JsonObject {
        fun cleanFrames(o: JsonObject): JsonObject {
            val frames = o["keyframes"] as? JsonArray ?: return o
            val cleaned = frames.map { if (it is JsonObject) JsonObject(it - "id") else it }
            return o.replacing("keyframes", JsonArray(cleaned))
        }
        var out = blob
        // Le modèle typé encode une transition en chaîne nue ; le v3 la veut `{ "type": … }`.
        for (key in listOf("opening", "closing")) {
            val raw = (out[key] as? JsonPrimitive)?.takeIf { it.isString } ?: continue
            out = out.replacing(key, buildJsonObject { put("type", raw.content) })
        }
        for (key in listOf("textObjects", "mediaObjects", "audioPlayerObjects")) {
            val list = out[key] as? JsonArray ?: continue
            out = out.replacing(key, JsonArray(list.map { if (it is JsonObject) cleanFrames(it) else it }))
        }
        return out
    }

    // MARK: - v3 → v1 (l'inverse)

    private fun dropNulls(payload: JsonObject): JsonObject = JsonObject(payload.filterValues { it !is JsonNull })

    private fun envelopeToV1(o: JsonObject, position: Pair<Double, Double>): MutableMap<String, JsonElement> {
        val transform = o["transform"] as? JsonObject
        val timing = o["timing"] as? JsonObject
        val out = mutableMapOf<String, JsonElement>()
        out["id"] = o["id"] ?: JsonPrimitive("")
        out["x"] = JsonPrimitive(position.first)
        out["y"] = JsonPrimitive(position.second)
        out["scale"] = JsonPrimitive(transform.num("scale", 1.0))
        out["rotation"] = JsonPrimitive(transform.num("rotation", 0.0))
        val opacity = transform.num("opacity", 1.0)
        if (opacity != 1.0) out["opacity"] = JsonPrimitive(opacity)
        o["z"]?.let { out["zIndex"] = it }
        timing?.get("start")?.let { out["startTime"] = it }
        timing?.get("end")?.let { out["endTime"] = it }
        timing?.get("keyframes")?.let { out["keyframes"] = it }
        (o["locale"] as? JsonPrimitive)?.let { out["sourceLanguage"] = it }
        return out
    }

    private fun JsonObject?.num(key: String, default: Double): Double = this?.get(key).number() ?: default

    private fun positionOf(o: JsonObject, carrierAspect: Double?): Pair<Double, Double> {
        val anchor = o["anchor"] as? JsonObject
        if ((anchor?.get("t") as? JsonPrimitive)?.content == "band") {
            return 0.5 to if ((anchor?.get("edge") as? JsonPrimitive)?.content == "top") BAND_TOP_Y else BAND_BOTTOM_Y
        }
        val x = anchor.num("x", 0.5)
        val y = anchor.num("y", 0.5)
        if (carrierAspect == null || o.planeName() == "bg" || o.kindName() == "media") return x to y
        return unmapFree(x, y, carrierAspect)
    }

    /** Une scène (et le son du document) → le blob v1 qui l'a produite. */
    public fun toV1(document: JsonObject, sceneIndex: Int = 0): V1Wire {
        val out = mutableMapOf<String, JsonElement>()
        val sound = document["sound"] as? JsonObject
        if (sound != null) restoreSound(sound, out)
        val scene = document["scenes"].objects().getOrNull(sceneIndex)
            ?: return V1Wire(JsonObject(out), emptyMap(), emptyList())

        val carrier = scene["carrierAspect"].number()?.takeIf { it > 0.0 }
        if (carrier != null) out["canvasAspectRatio"] = JsonPrimitive(carrier)
        val texts = mutableListOf<JsonElement>()
        val medias = mutableListOf<JsonElement>()
        val stickers = mutableListOf<JsonElement>()
        val locations = mutableListOf<JsonElement>()
        val audios = mutableListOf<JsonElement>()
        val preserved = mutableListOf<JsonObject>()
        val bandEdges = mutableMapOf<String, String>()

        for (o in scene["objects"].objects()) {
            val payload = o.payloadObject()
            val position = positionOf(o, carrier)
            val anchor = o["anchor"] as? JsonObject
            val id = (o["id"] as? JsonPrimitive)?.content
            if ((anchor?.get("t") as? JsonPrimitive)?.content == "band" && id != null) {
                bandEdges[id] = (anchor?.get("edge") as? JsonPrimitive)?.content ?: "bottom"
            }
            when {
                o.kindName() == "media" && o.planeName() == "bg" -> {
                    payload.str("background")?.let { out["background"] = JsonPrimitive(it) }
                    (payload["transform"] as? JsonObject)?.let { out["backgroundTransform"] = it }
                    payload.str("filter")?.let { out["filter"] = JsonPrimitive(it) }
                    payload["filterIntensity"].number()?.let { out["filterIntensity"] = JsonPrimitive(it) }
                }
                o.kindName() == "media" -> medias += mediaToV1(o, position, payload, out)
                o.kindName() == "text" -> texts += JsonObject(envelopeToV1(o, position).apply { putAll(dropNulls(payload)) })
                o.kindName() == "sticker" -> stickers += JsonObject(envelopeToV1(o, position).apply { putAll(dropNulls(payload)) })
                o.kindName() == "place" -> locations += locationToV1(o, position, payload)
                o.kindName() == "audio" -> audios += audioToV1(o, position, payload)
                o.kindName() == "drawing" -> {
                    (payload["strokes"] as? JsonArray)?.let { out["drawingStrokes"] = it }
                    payload.str("data")?.let { out["drawingData"] = JsonPrimitive(it) }
                }
                else -> preserved += o
            }
        }
        if (texts.isNotEmpty()) out["textObjects"] = JsonArray(texts)
        if (medias.isNotEmpty()) out["mediaObjects"] = JsonArray(medias)
        if (stickers.isNotEmpty()) out["stickerObjects"] = JsonArray(stickers)
        if (locations.isNotEmpty()) out["locationObjects"] = JsonArray(locations)
        if (audios.isNotEmpty()) out["audioPlayerObjects"] = JsonArray(audios)
        scene["timelineDuration"]?.let { out["timelineDuration"] = it }
        scene["opening"]?.let { out["opening"] = it }
        scene["closing"]?.let { out["closing"] = it }
        scene["clipTransitions"]?.let { out["clipTransitions"] = it }
        scene["thumbHash"]?.let { out["thumbHash"] = it }
        return V1Wire(JsonObject(out), bandEdges, preserved)
    }

    private fun mediaToV1(
        o: JsonObject,
        position: Pair<Double, Double>,
        payload: JsonObject,
        blob: MutableMap<String, JsonElement>,
    ): JsonObject {
        val isBackground = (payload["isBackground"] as? JsonPrimitive)?.booleanOrNull == true
        val own = if (isBackground && payload.str("filter") != null) {
            blob["filter"] = payload["filter"]!!
            payload["filterIntensity"]?.let { blob["filterIntensity"] = it }
            JsonObject(payload - "filter" - "filterIntensity")
        } else payload
        return JsonObject(envelopeToV1(o, position).apply { putAll(dropNulls(own)) })
    }

    private fun locationToV1(o: JsonObject, position: Pair<Double, Double>, payload: JsonObject): JsonObject =
        JsonObject(envelopeToV1(o, position).apply { putAll(dropNulls(payload)) })

    private fun audioToV1(o: JsonObject, position: Pair<Double, Double>, payload: JsonObject): JsonObject {
        val rest = dropNulls(JsonObject(payload - "variants"))
        return JsonObject(
            envelopeToV1(o, position).apply {
                putAll(rest)
                payload["variants"]?.let { put("backgroundAudioVariants", it) }
            },
        )
    }

    private fun restoreSound(sound: JsonObject, out: MutableMap<String, JsonElement>) {
        val source = sound["source"] as? JsonObject
        if ((source?.get("t") as? JsonPrimitive)?.content == "library") {
            source?.get("soundId")?.let { out["backgroundAudioId"] = it }
        }
        sound["volume"]?.let { out["backgroundAudioVolume"] = it }
        val bounds = sound["bounds"] as? JsonObject
        bounds?.get("start")?.let { out["backgroundAudioStart"] = it }
        bounds?.get("end")?.let { out["backgroundAudioEnd"] = it }
        sound["transcriptions"]?.let { out["voiceTranscriptions"] = it }
        sound["variants"]?.let { out["backgroundAudioVariants"] = it }
    }
}
