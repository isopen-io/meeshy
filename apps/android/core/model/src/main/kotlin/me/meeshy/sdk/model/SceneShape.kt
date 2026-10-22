package me.meeshy.sdk.model

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/** Un rectangle en fractions de la scène (0…1) ; pur, sans dépendance graphique. */
data class SceneRect(val left: Double, val top: Double, val right: Double, val bottom: Double) {
    val width: Double get() = right - left
    val height: Double get() = bottom - top
}

/**
 * La FORME de la scène — miroir de `SceneShape` (iOS). La scène est toujours 9:16 ; un fond posé
 * en AJUSTER n'occupe qu'une bande centrale ([mediaBand]), et la scène se resserre sur elle
 * ([frame]) SAUF si un objet qui peint des pixels déborde de la bande — décision binaire.
 */
object SceneShape {
    const val ASPECT: Double = 9.0 / 16.0
    const val OBJECT_PADDING: Double = 0.16
    const val BAND_TOP_Y: Double = 0.12
    const val BAND_BOTTOM_Y: Double = 0.88
    private const val TEXT_PAINT_HALF_WIDTH = 0.5
    private const val CONTAINMENT_TOLERANCE = 0.001

    val UNIT_RECT: SceneRect = SceneRect(0.0, 0.0, 1.0, 1.0)

    /** La zone qu'occupe un média de ratio [backgroundAspect] posé en AJUSTER dans la scène 9:16. */
    fun mediaBand(backgroundAspect: Double): SceneRect {
        if (!backgroundAspect.isFinite() || backgroundAspect <= 0.0) return UNIT_RECT
        if (backgroundAspect > ASPECT) {
            val hauteur = ASPECT / backgroundAspect
            return SceneRect(0.0, (1 - hauteur) / 2, 1.0, (1 + hauteur) / 2)
        }
        if (backgroundAspect < ASPECT) {
            val largeur = backgroundAspect / ASPECT
            return SceneRect((1 - largeur) / 2, 0.0, (1 + largeur) / 2, 1.0)
        }
        return UNIT_RECT
    }

    /** La zone du média de [scene] ; `null` sans fond ou sans ratio connu. Un fond REMPLI occupe tout. */
    fun mediaBand(scene: SceneV3, backgroundAspect: Double? = null): SceneRect? {
        val rapport = resolvedBackgroundAspect(scene, backgroundAspect) ?: return null
        if (rendersFilled(declaredFitMode(scene))) return UNIT_RECT
        return mediaBand(rapport)
    }

    /** Ce qu'on montre : la bande du média, ou la scène entière. */
    sealed interface Frame {
        val rect: SceneRect
        val tightensAnything: Boolean

        data class MediaBand(val zone: SceneRect) : Frame {
            override val rect: SceneRect get() = zone
            override val tightensAnything: Boolean get() = zone != UNIT_RECT
        }

        data object WholeScene : Frame {
            override val rect: SceneRect get() = UNIT_RECT
            override val tightensAnything: Boolean get() = false
        }
    }

    fun frame(scene: SceneV3, backgroundAspect: Double? = null): Frame {
        val fond = backgroundMedia(scene) ?: return Frame.WholeScene
        val zone = mediaBand(scene, backgroundAspect) ?: return Frame.WholeScene
        val deborde = scene.objects.any { it.id != fond.id && paintsPixels(it) && !contains(zone, anchorBox(it)) }
        return if (deborde) Frame.WholeScene else Frame.MediaBand(zone)
    }

    fun backgroundMedia(scene: SceneV3): ObjectV3? =
        scene.objects.firstOrNull { isBackground(it) && carriesPicture(it) } ?: scene.objects.firstOrNull(::isBackground)

    fun isBackground(o: ObjectV3): Boolean =
        o.kind == "media" && (o.plane == "bg" || (o.payload["isBackground"] as? JsonPrimitive)?.booleanOrNull == true)

    fun carriesPicture(o: ObjectV3): Boolean =
        !o.payload.string("mediaURL").isNullOrEmpty() || mediaReference(o) != null || declaredAspect(o) != null

    fun declaredAspect(o: ObjectV3): Double? = o.payload.number("aspectRatio")?.takeIf { it > 0 }

    fun backgroundAspect(scene: SceneV3): Double? = backgroundMedia(scene)?.let(::declaredAspect)

    /** Une pièce jointe sonore, une mention ou un kind inconnu ne peint rien : ils ne débordent de rien. */
    fun paintsPixels(o: ObjectV3): Boolean = when (o.kind) {
        "text", "sticker", "place", "drawing" -> true
        "media" -> !isBackground(o) || carriesPicture(o)
        else -> false
    }

    /** La boîte qu'un objet peut peindre autour de son ancre, rotation comprise (calculée en unités de largeur). */
    fun anchorBox(o: ObjectV3): SceneRect {
        val (cx, cy) = if (o.anchor.t == "band") {
            0.5 to (if (o.anchor.edge == "top") BAND_TOP_Y else BAND_BOTTOM_Y)
        } else {
            o.anchor.x to o.anchor.y
        }
        val facteur = o.transform.scale.coerceIn(0.5, 3.0)
        val marge = OBJECT_PADDING * facteur
        val demiLargeur = max(marge, paintHalfWidth(o))
        val demiHauteur = marge / ASPECT
        val angle = Math.toRadians(o.transform.rotation)
        val c = abs(cos(angle))
        val s = abs(sin(angle))
        val enveloppeX = demiLargeur * c + demiHauteur * s
        val enveloppeY = (demiLargeur * s + demiHauteur * c) * ASPECT
        return SceneRect(cx - enveloppeX, cy - enveloppeY, cx + enveloppeX, cy + enveloppeY)
    }

    private fun paintHalfWidth(o: ObjectV3): Double =
        if (o.kind == "text") TEXT_PAINT_HALF_WIDTH * max(o.transform.scale, 0.0) else 0.0

    private fun rendersFilled(mode: String?): Boolean = mode != "fit"

    private fun declaredFitMode(scene: SceneV3): String? =
        scene.objects.filter(::isBackground).firstNotNullOfOrNull { it.payload.obj("transform")?.string("videoFitMode") }

    private fun mediaReference(o: ObjectV3): String? =
        o.payload.string("postMediaId")?.takeIf { it.isNotEmpty() } ?: o.payload.string("mediaId")?.takeIf { it.isNotEmpty() }

    private fun resolvedBackgroundAspect(scene: SceneV3, override: Double?): Double? {
        backgroundMedia(scene) ?: return null
        return (override ?: backgroundAspect(scene))?.takeIf { it.isFinite() && it > 0 }
    }

    private fun contains(zone: SceneRect, box: SceneRect): Boolean =
        box.left >= zone.left - CONTAINMENT_TOLERANCE && box.right <= zone.right + CONTAINMENT_TOLERANCE &&
            box.top >= zone.top - CONTAINMENT_TOLERANCE && box.bottom <= zone.bottom + CONTAINMENT_TOLERANCE

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.number(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull

    private fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject

}
