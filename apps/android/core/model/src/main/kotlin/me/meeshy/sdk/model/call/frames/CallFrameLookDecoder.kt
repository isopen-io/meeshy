package me.meeshy.sdk.model.call.frames

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Lit l'apparence d'un cadre dans le JSON partagé. Les clés OBLIGATOIRES du format sont strictes
 * (une valeur hors liste fermée fait lever [CallFrameDecodeException], et le catalogue ne perd que
 * SON motif) ; les clés FACULTATIVES de l'extension (#9197) sont lues avec tolérance : ce que ce
 * client ne sait pas dessiner est ignoré en silence, jamais une erreur.
 */
internal class CallFrameDecodeException(message: String) : IllegalArgumentException(message)

private fun fail(path: String): Nothing = throw CallFrameDecodeException("cadre illisible : $path")

private fun JsonElement?.obj(path: String): JsonObject = this as? JsonObject ?: fail(path)

private fun JsonObject.prim(key: String): JsonPrimitive? = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }

private fun JsonObject.str(key: String): String? = prim(key)?.takeIf { it.isString }?.contentOrNull

private fun JsonObject.requiredStr(key: String, path: String): String = str(key) ?: fail("$path.$key")

private fun JsonObject.num(key: String): Double? = prim(key)?.takeIf { !it.isString }?.doubleOrNull

private fun JsonObject.requiredNum(key: String, path: String): Double = num(key) ?: fail("$path.$key")

private fun JsonObject.flag(key: String): Boolean? = prim(key)?.takeIf { !it.isString }?.booleanOrNull

private fun JsonObject.list(key: String): List<JsonElement>? = (this[key] as? JsonArray)?.toList()

private fun <T : Any> T?.required(path: String): T = this ?: fail(path)

internal object CallFrameLookDecoder {

    fun look(json: JsonObject): CallFrameLook = CallFrameLook(
        layout = layout(json["layout"].obj("layout")),
        slot = slot(json["slot"].obj("slot")),
        background = background(json["background"].obj("background")),
        pattern = (json["pattern"] as? JsonObject)?.let(::pattern),
        border = (json["border"] as? JsonObject)?.let(::border),
        ornaments = json.list("ornaments").required("ornaments").mapIndexed { i, e -> ornament(e.obj("ornaments[$i]")) },
        brand = (json["brand"] as? JsonObject)?.let(::brand),
        names = names(json["names"].obj("names")),
        title = title(json["title"].obj("title"), "title"),
        subtitle = (json["subtitle"] as? JsonObject)?.let { title(it, "subtitle") },
        elements = json.list("elements").orEmpty().mapNotNull { (it as? JsonObject)?.let(::elementOrNull) },
        scene = json.list("scene").orEmpty().mapNotNull { (it as? JsonObject)?.let(::sceneLayerOrNull) },
        behaviors = json.list("behaviors").orEmpty().mapNotNull { (it as? JsonObject)?.let(::behaviorOrNull) },
        fallbacks = (json["fallbacks"] as? JsonObject)?.let(::fallbacks),
    )

    fun credits(json: JsonObject?): CallFrameCredits? {
        val author = json?.str("author") ?: return null
        val createdAt = json.str("createdAt") ?: return null
        return CallFrameCredits(author, createdAt, json.str("updatedAt"))
    }

    fun surfaces(json: JsonObject): List<CallFrameSurface> =
        json.list("surfaces")
            ?.mapNotNull { CallFrameSurface.fromRaw((it as? JsonPrimitive)?.contentOrNull) }
            ?.distinct()
            ?.takeIf { it.isNotEmpty() }
            ?: listOf(CallFrameSurface.CAPTURE)

    fun cost(json: JsonObject): CallFrameCost? = CallFrameCost.fromRaw(json.str("cost"))

    private fun layout(json: JsonObject) = CallFrameLayout(
        arrangement = CallFrameArrangement.fromRaw(json.str("arrangement")).required("layout.arrangement"),
        margin = json.requiredNum("margin", "layout"),
        gap = json.requiredNum("gap", "layout"),
        top = json.requiredNum("top", "layout"),
        bottom = json.requiredNum("bottom", "layout"),
    )

    private fun slot(json: JsonObject) = CallFrameSlotStyle(
        shape = CallFrameSlotShape.fromRaw(json.str("shape")).required("slot.shape"),
        radius = json.num("radius"),
        stroke = (json["stroke"] as? JsonObject)?.let {
            CallFrameStroke(it.requiredStr("color", "slot.stroke"), it.requiredNum("width", "slot.stroke"))
        },
        double = json.flag("double") ?: false,
        glow = json.str("glow"),
        shadow = json.flag("shadow") ?: false,
        card = (json["card"] as? JsonObject)?.let {
            CallFrameCard(it.requiredStr("color", "slot.card"), it.requiredNum("pad", "slot.card"), it.requiredNum("foot", "slot.card"))
        },
        tilt = CallFrameTilt.fromRaw(json.str("tilt")).required("slot.tilt"),
        tone = CallFrameTone.fromRaw(json.str("tone")).required("slot.tone"),
        duotone = json.list("duotone")?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            ?.takeIf { it.size == 2 }?.let { CallFrameDuotone(it[0], it[1]) },
        look = json.list("look").orEmpty().mapNotNull { (it as? JsonObject)?.let(::slotLookOrNull) },
    )

    private fun slotLookOrNull(json: JsonObject): CallFrameSlotLook? {
        val id = CallFrameSlotLookKind.fromRaw(json.str("id")) ?: return null
        return CallFrameSlotLook(id, json.num("amount"), json.num("size"))
    }

    private fun background(json: JsonObject): CallFrameBackground {
        val colors = json.list("colors")?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
        return when (json.str("kind")) {
            "solid" -> CallFrameBackground.Solid(json.requiredStr("color", "background"))
            "linear" -> CallFrameBackground.Linear(colors, json.requiredNum("angle", "background"))
            "radial" -> CallFrameBackground.Radial(colors)
            "accent" -> CallFrameBackground.Accent
            else -> fail("background.kind")
        }
    }

    private fun pattern(json: JsonObject) = CallFramePattern(
        kind = CallFramePatternKind.fromRaw(json.str("kind")).required("pattern.kind"),
        color = json.requiredStr("color", "pattern"),
        opacity = json.requiredNum("opacity", "pattern"),
    )

    private fun border(json: JsonObject) = CallFrameBorder(
        kind = CallFrameBorderKind.fromRaw(json.str("kind")).required("border.kind"),
        color = json.requiredStr("color", "border"),
        width = json.requiredNum("width", "border"),
        inset = json.requiredNum("inset", "border"),
    )

    private fun ornament(json: JsonObject) = CallFrameOrnament(
        kind = CallFrameOrnamentKind.fromRaw(json.str("kind")).required("ornament.kind"),
        color = json.requiredStr("color", "ornament"),
        density = CallFrameDensity.fromRaw(json.str("density")).required("ornament.density"),
        layer = CallFrameLayer.fromRaw(json.str("layer")).required("ornament.layer"),
        motion = CallFrameOrnamentMotion.fromRaw(json.str("motion")) ?: CallFrameOrnamentMotion.STILL,
    )

    private fun brand(json: JsonObject) = CallFrameBrand(
        mark = CallFrameBrandMark.fromRaw(json.str("mark")).required("brand.mark"),
        place = CallFrameBrandPlace.fromRaw(json.str("place")).required("brand.place"),
        color = json.requiredStr("color", "brand"),
        size = CallFrameTextSize.fromRaw(json.str("size")).required("brand.size"),
        font = CallFrameFont.fromRaw(json.str("font")),
        watermark = (json["watermark"] as? JsonObject)?.let(::watermarkOrNull),
    )

    private fun watermarkOrNull(json: JsonObject): CallFrameWatermark? {
        val content = CallFrameWatermarkContent.fromRaw(json.str("content")) ?: return null
        val orientation = CallFrameWatermarkOrientation.fromRaw(json.str("orientation")) ?: return null
        return CallFrameWatermark(content, orientation, json.num("opacity") ?: return null)
    }

    private fun names(json: JsonObject) = CallFrameNames(
        show = CallFrameNameShow.fromRaw(json.str("show")).required("names.show"),
        style = CallFrameNameStyle.fromRaw(json.str("style")).required("names.style"),
        font = CallFrameFont.fromRaw(json.str("font")).required("names.font"),
        color = json.requiredStr("color", "names"),
        fill = json.str("fill"),
    )

    private fun title(json: JsonObject, path: String) = CallFrameTitle(
        source = CallFrameTitleSource.fromRaw(json.str("source")).required("$path.source"),
        font = CallFrameFont.fromRaw(json.str("font")).required("$path.font"),
        color = json.requiredStr("color", path),
        place = CallFrameTitlePlace.fromRaw(json.str("place")).required("$path.place"),
        size = CallFrameTextSize.fromRaw(json.str("size")).required("$path.size"),
        effect = CallFrameTextEffect.fromRaw(json.str("effect")),
        letterCase = CallFrameLetterCase.fromRaw(json.str("case")),
        form = CallFrameTextForm.fromRaw(json.str("form")),
    )

    private fun elementOrNull(json: JsonObject): CallFrameElement? {
        return CallFrameElement(
        source = CallFrameTitleSource.fromRaw(json.str("source")) ?: return null,
        form = CallFrameTextForm.fromRaw(json.str("form")),
        place = CallFrameElementPlace.fromRaw(json.str("place")) ?: return null,
        font = CallFrameFont.fromRaw(json.str("font")) ?: return null,
        color = json.str("color") ?: return null,
        size = CallFrameTextSize.fromRaw(json.str("size")) ?: return null,
        effect = CallFrameTextEffect.fromRaw(json.str("effect")),
        letterCase = CallFrameLetterCase.fromRaw(json.str("case")),
    )
    }

    private fun sceneLayerOrNull(json: JsonObject): CallFrameSceneLayer? {
        return CallFrameSceneLayer(
        id = json.str("id") ?: return null,
        kind = CallFrameSceneLayerKind.fromRaw(json.str("kind")) ?: return null,
        depth = CallFrameSceneDepth.fromRaw(json.str("depth")) ?: return null,
        src = json.str("src"),
        preset = CallFrameOrnamentKind.fromRaw(json.str("preset")),
        color = json.str("color"),
        amount = json.num("amount"),
        maxParticles = json.prim("max")?.takeIf { !it.isString }?.intOrNull,
    )
    }

    private fun behaviorOrNull(json: JsonObject): CallFrameBehavior? {
        return CallFrameBehavior(
        trigger = CallFrameBehaviorTrigger.fromRaw(json.str("trigger")) ?: return null,
        `when` = CallFrameBehaviorCondition.fromRaw(json.str("when")),
        target = json.str("target"),
        action = CallFrameBehaviorAction.fromRaw(json.str("action")) ?: return null,
        duration = json.num("duration"),
        color = json.str("color"),
    )
    }

    private fun fallbacks(json: JsonObject) = CallFrameFallbacks(
        reduced = (json["reduced"] as? JsonObject)?.let(::fallbackTier),
        minimal = (json["minimal"] as? JsonObject)?.let(::fallbackTier),
    )

    private fun fallbackTier(json: JsonObject) = CallFrameFallbackTier(
        hide = json.list("hide").orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull },
        still = json.list("still").orEmpty().mapNotNull {
            val o = it as? JsonObject ?: return@mapNotNull null
            CallFrameFallbackStill(o.str("layer") ?: return@mapNotNull null, o.str("src") ?: return@mapNotNull null)
        },
    )
}
