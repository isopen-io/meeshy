package me.meeshy.sdk.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Le pont v3 → runtime v1. Port de `StoryEffects(rendering:sceneIndex:)`
 * (`CanvasV3Migration.swift:522-706`).
 *
 * Rien ne se peint en v3 : le document est rabattu sur les familles que le
 * viewer Android peint déjà. La famille `place` absente du modèle Android est
 * ignorée plutôt que fabriquée — un objet qu'on ne sait pas rendre ne doit pas
 * coûter les autres. La famille `drawing`, elle, projette ses traits éditables
 * (`payload.strokes`) sur [StoryEffects.drawingStrokes] ; seul le blob PKDrawing
 * legacy (`payload.data`, base64) reste ignoré, faute de rendu Android.
 */
private const val SCENE_ASPECT = 9.0 / 16.0
private const val BAND_ANCHOR_TOP = 0.08
private const val BAND_ANCHOR_BOTTOM = 0.92
private const val CENTER_PIVOT = 0.5

private val projectionJson = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

private fun JsonObject.str(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.dbl(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull

private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

private fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject

private fun JsonObject.strMap(key: String): Map<String, String>? =
    obj(key)?.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.content?.let { k to it } }
        ?.toMap()?.takeIf { it.isNotEmpty() }

private inline fun <reified T> decodeWire(element: JsonObject?): T? =
    element?.let { runCatching { projectionJson.decodeFromJsonElement<T>(it) }.getOrNull() }

/**
 * L'INVERSE exact du letterboxing appliqué par la conversion v1 → v3.
 *
 * `y' = top + y·h` s'inverse en `y = (y' − top) / h`. Sans `carrierAspect` —
 * un document v3 natif n'en porte pas — rien ne bouge. Un décodeur qui
 * l'ignorerait ne planterait JAMAIS : il poserait simplement les objets au
 * mauvais endroit, sur du 16:9 `y = 0,20` restant figé à `0,405`.
 */
private fun unmapFreeAnchor(x: Double, y: Double, carrierAspect: Double?): Pair<Double, Double> {
    if (carrierAspect == null || !carrierAspect.isFinite() || carrierAspect <= 0.0) return x to y
    if (carrierAspect > SCENE_ASPECT) {
        val h = SCENE_ASPECT / carrierAspect
        return x to ((y - (1 - h) / 2) / h)
    }
    if (carrierAspect < SCENE_ASPECT) {
        val w = carrierAspect / SCENE_ASPECT
        return ((x - (1 - w) / 2) / w) to y
    }
    return x to y
}

private fun ObjectV3.position(carrierAspect: Double?): Pair<Double, Double> {
    if (anchor.t == "band") {
        return CENTER_PIVOT to if (anchor.edge == "top") BAND_ANCHOR_TOP else BAND_ANCHOR_BOTTOM
    }
    // Le plan de fond et le porteur média n'avaient pas été remappés à l'aller :
    // ils ne sont pas déremappés au retour.
    if (plane == "bg" || kind == "media") return anchor.x to anchor.y
    return unmapFreeAnchor(anchor.x, anchor.y, carrierAspect)
}

private fun ObjectV3.pivot(): StoryAnchorPoint {
    if (payload.str("anchorPoint") == "center") return StoryAnchorPoint()
    val anchorPayload = payload.obj("anchor") ?: return StoryAnchorPoint()
    val x = anchorPayload.dbl("x") ?: return StoryAnchorPoint()
    val y = anchorPayload.dbl("y") ?: return StoryAnchorPoint()
    return StoryAnchorPoint(x = x, y = y)
}

private fun ObjectV3.asText(at: Pair<Double, Double>): StoryTextObject? {
    val text = payload.str("text") ?: return null
    return StoryTextObject(
        id = id,
        text = text,
        x = at.first,
        y = at.second,
        scale = transform.scale,
        rotation = transform.rotation,
        zIndex = z,
        anchor = pivot(),
        fontSize = payload.dbl("fontSize") ?: 64.0,
        fontFamily = payload.str("fontFamily") ?: "system",
        textStyle = payload.str("textStyle"),
        textColor = payload.str("textColor"),
        textAlign = payload.str("textAlign"),
        textBg = payload.str("textBg"),
        backgroundStyle = decodeWire(payload.obj("backgroundStyle")),
        borderColor = payload.str("borderColor"),
        borderWidth = payload.dbl("borderWidth"),
        textEffect = payload.str("textEffect"),
        translations = payload.strMap("translations"),
        sourceLanguage = locale,
        startTime = timing?.start,
        duration = payload.dbl("duration"),
        fadeIn = payload.dbl("fadeIn"),
        fadeOut = payload.dbl("fadeOut"),
        isLocked = payload.bool("isLocked"),
        keyframes = timing?.keyframes,
    )
}

private fun ObjectV3.asMedia(at: Pair<Double, Double>): StoryMediaObject {
    val muted = payload.bool("muted") ?: false
    return StoryMediaObject(
        id = id,
        postMediaId = payload.str("postMediaId") ?: "",
        mediaURL = payload.str("mediaURL"),
        mediaType = payload.str("mediaType") ?: "image",
        placement = payload.str("placement") ?: "media",
        x = at.first,
        y = at.second,
        scale = transform.scale,
        rotation = transform.rotation,
        volume = if (muted) 0f else (payload.dbl("volume")?.toFloat() ?: 1f),
        aspectRatio = payload.dbl("aspectRatio") ?: 1.0,
        anchor = pivot(),
        intrinsicDuration = payload.dbl("intrinsicDuration"),
        isBackground = payload.bool("isBackground") ?: false,
        loop = payload.bool("loop") ?: false,
        // Les quatre bornes se lisent ENSEMBLE ou pas du tout (#5085) : un
        // recadrage amputé n'a pas de repli sensé, et le compléter
        // fabriquerait un cadrage que personne n'a posé.
        crop = StoryMediaCrop.fromPayloadBounds(
            payload.dbl("cropX"), payload.dbl("cropY"),
            payload.dbl("cropW"), payload.dbl("cropH"),
        ),
        zIndex = z,
        startTime = timing?.start,
        duration = payload.dbl("duration"),
        // **Les deux bornes se lisent ENSEMBLE ou pas du tout** (#5129), même
        // règle que le recadrage juste au-dessus : un début sans fin n'a pas de
        // repli sensé. Et ce ne sont PAS `startTime`/`duration` — celles-là
        // disent quand l'objet est à l'écran, celles-ci quelle partie de la
        // source joue.
        sourceStart = StorySourceWindow
            .fromPayloadBounds(payload.dbl("sourceStart"), payload.dbl("sourceEnd"))?.first,
        sourceEnd = StorySourceWindow
            .fromPayloadBounds(payload.dbl("sourceStart"), payload.dbl("sourceEnd"))?.second,
        fadeIn = payload.dbl("fadeIn"),
        fadeOut = payload.dbl("fadeOut"),
        sourceLanguage = locale,
        keyframes = timing?.keyframes,
    )
}

/**
 * A sticker with neither channel is nothing to paint, so it is dropped like
 * every other family here on a missing required field. One with only
 * [StorySticker.postMediaId] (a future writer that skips the emoji fallback)
 * must still project — Android is the reader here, not the compatibility
 * guarantor; the fallback discipline lives at the writer.
 */
private fun ObjectV3.asSticker(at: Pair<Double, Double>): StorySticker? {
    val emoji = payload.str("emoji")
    val postMediaId = payload.str("postMediaId")
    if (emoji == null && postMediaId == null) return null
    return StorySticker(
        id = id,
        emoji = emoji ?: "",
        postMediaId = postMediaId ?: "",
        provider = payload.str("provider"),
        x = at.first,
        y = at.second,
        scale = transform.scale,
        rotation = transform.rotation,
        zIndex = z,
        baseSize = payload.dbl("baseSize") ?: 140.0,
        anchor = pivot(),
        startTime = timing?.start,
        duration = payload.dbl("duration"),
        fadeIn = payload.dbl("fadeIn"),
        fadeOut = payload.dbl("fadeOut"),
    )
}

private fun ObjectV3.asAudio(at: Pair<Double, Double>): StoryAudioPlayerObject = StoryAudioPlayerObject(
    id = id,
    postMediaId = payload.str("postMediaId") ?: "",
    placement = payload.str("placement") ?: "overlay",
    x = at.first,
    y = at.second,
    volume = payload.dbl("volume")?.toFloat() ?: 1f,
    isBackground = payload.bool("isBackground"),
    backgroundAudioVariants = (payload["variants"] as? JsonArray)
        ?.mapNotNull { decodeWire<StoryAudioVariant>(it as? JsonObject) },
    zIndex = z,
    startTime = timing?.start?.toFloat(),
    duration = payload.dbl("duration")?.toFloat(),
    // iOS écrit les deux bornes sur les DEUX familles (`CanvasV3Migration.swift:457`
    // et `:542`) : les lire pour le seul média laisserait un vocal rogné jouer
    // en entier (#5129).
    sourceStart = StorySourceWindow
        .fromPayloadBounds(payload.dbl("sourceStart"), payload.dbl("sourceEnd"))?.first?.toFloat(),
    sourceEnd = StorySourceWindow
        .fromPayloadBounds(payload.dbl("sourceStart"), payload.dbl("sourceEnd"))?.second?.toFloat(),
    loop = payload.bool("loop"),
    fadeIn = payload.dbl("fadeIn")?.toFloat(),
    fadeOut = payload.dbl("fadeOut")?.toFloat(),
    sourceLanguage = locale,
)

/**
 * Les traits éditables d'un objet `drawing`. Port de la branche `.drawing` d'iOS
 * (`CanvasV3Migration.swift:580-583`) : seul `payload.strokes` est lu — le
 * `payload.data` (PKDrawing legacy en base64) n'a pas de rendu Android. Un objet
 * `drawing` sans trait exploitable rend `null` (idiome des autres familles :
 * `medias/stickers/audios` normalisent aussi le vide en `null`), si bien qu'un
 * `data`-seul, tolérable au décodeur, ne fabrique pas une couche de dessin vide.
 */
private fun ObjectV3.asDrawingStrokes(): List<StoryDrawingStroke>? =
    (payload["strokes"] as? JsonArray)
        ?.mapNotNull { decodeWire<StoryDrawingStroke>(it as? JsonObject) }
        ?.takeIf { it.isNotEmpty() }

private fun transitionOf(wire: JsonObject?): StoryTransitionEffect? {
    val raw = wire?.str("type") ?: return null
    return runCatching {
        projectionJson.decodeFromJsonElement(StoryTransitionEffect.serializer(), JsonPrimitive(raw))
    }.getOrNull()
}

/**
 * Rabat un document v3 sur les familles v1 que le viewer peint déjà.
 *
 * Le son est restitué AVANT toute garde de scène (règle O3) : une publication
 * purement sonore n'émet aucun cadre, et sauter sa restitution ferait
 * disparaître le son avec la scène absente.
 */
fun StoryEffects.Companion.rendering(document: CanvasV3, sceneIndex: Int = 0): StoryEffects {
    val sound = document.sound
    val soundId = sound?.source?.takeIf { it.t == "library" }?.soundId

    val scene = document.scenes.getOrNull(sceneIndex)
        ?: return StoryEffects(
            backgroundAudioId = soundId,
            backgroundAudioVolume = sound?.volume?.toFloat(),
            backgroundAudioStart = sound?.bounds?.start,
            backgroundAudioEnd = sound?.bounds?.end,
            voiceTranscriptions = sound?.transcriptions,
            backgroundAudioVariants = sound?.variants,
        )

    var background: String? = null
    var backgroundTransform: StoryBackgroundTransform? = null
    val texts = mutableListOf<StoryTextObject>()
    val medias = mutableListOf<StoryMediaObject>()
    val stickers = mutableListOf<StorySticker>()
    val audios = mutableListOf<StoryAudioPlayerObject>()
    var drawingStrokes: List<StoryDrawingStroke>? = null

    for (item in scene.objects) {
        val at = item.position(scene.carrierAspect)
        when {
            item.kind == "media" && item.plane == "bg" -> {
                background = item.payload.str("background")
                backgroundTransform = decodeWire(item.payload.obj("transform"))
            }
            item.kind == "media" -> medias += item.asMedia(at)
            item.kind == "text" -> item.asText(at)?.let { texts += it }
            item.kind == "sticker" -> item.asSticker(at)?.let { stickers += it }
            item.kind == "audio" -> audios += item.asAudio(at)
            // Le dernier objet `drawing` gagne, comme iOS (`drawingStrokes = decode(...)`,
            // une affectation, pas une accumulation) ; l'écrivain n'en émet qu'un.
            item.kind == "drawing" -> drawingStrokes = item.asDrawingStrokes()
            else -> Unit
        }
    }

    val filterCarrier = scene.objects.firstOrNull {
        it.kind == "media" && it.plane == "content" && it.payload.str("filter") != null
    } ?: scene.objects.firstOrNull {
        it.kind == "media" && it.plane == "bg" && it.payload.str("filter") != null
    }

    return StoryEffects(
        background = background,
        backgroundTransform = backgroundTransform,
        filter = filterCarrier?.payload?.str("filter"),
        filterIntensity = filterCarrier?.payload?.dbl("filterIntensity"),
        textObjects = texts,
        mediaObjects = medias.ifEmpty { null },
        stickerObjects = stickers.ifEmpty { null },
        audioPlayerObjects = audios.ifEmpty { null },
        drawingStrokes = drawingStrokes,
        backgroundAudioId = soundId,
        backgroundAudioVolume = sound?.volume?.toFloat(),
        backgroundAudioStart = sound?.bounds?.start,
        backgroundAudioEnd = sound?.bounds?.end,
        voiceTranscriptions = sound?.transcriptions,
        backgroundAudioVariants = sound?.variants,
        thumbHash = scene.thumbHash,
        timelineDuration = scene.timelineDuration,
        opening = transitionOf(scene.opening),
        closing = transitionOf(scene.closing),
        clipTransitions = scene.clipTransitions?.mapNotNull { decodeWire<StoryClipTransition>(it) },
    )
}
