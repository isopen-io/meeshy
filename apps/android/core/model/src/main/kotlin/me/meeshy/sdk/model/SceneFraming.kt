package me.meeshy.sdk.model

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * **Une carte de fil cadre la scène sur son CONTENU, pas sur son gabarit** — miroir de `SceneFraming` (iOS, MeeshyUI).
 *
 * La scène est composée en 9:16 ; la carte montre la zone qui porte quelque chose : l'UNION de la bande du média de fond et
 * des ancres des objets visibles, toujours en pleine largeur (la carte raccourcit, elle ne zoome jamais). Un objet qui ne peint
 * rien (un son, une mention) n'y entre pas. Une ancre n'est pas une taille : la boîte des objets est élargie d'une marge
 * ([SceneShape.anchorBox]) et bornée par un plancher ([MINIMUM_SIDE]) — le plancher ne s'applique qu'à ce qui est deviné,
 * jamais à la bande, qui est mesurée.
 */
object SceneFraming {
    const val MINIMUM_SIDE: Double = 0.42
    const val MAX_CARD_HEIGHT_RATIO: Double = 1.4
    const val MIN_CARD_ASPECT: Double = 1 / MAX_CARD_HEIGHT_RATIO
    private const val UNTOUCHED_TOLERANCE = 0.001
    private const val WHOLE_HEIGHT = 0.999
    private const val CROP_BOUNDS = 4

    /** Une boîte posée dans la carte, en unités de la carte : la scène 9:16 agrandie et décalée. */
    data class Placement(val x: Double, val y: Double, val width: Double, val height: Double)

    /** Le rapport de la carte, plafonné en hauteur à [MAX_CARD_HEIGHT_RATIO] fois sa largeur (iOS `SceneCardHeightCap`). */
    fun clampedCardAspect(naturalAspect: Double): Double = max(naturalAspect, MIN_CARD_ASPECT)

    /** La scène montre-t-elle quelque chose ? Un fond ne compte que s'il porte un média. */
    fun showsSomething(scene: SceneV3): Boolean = scene.objects.any(SceneShape::paintsPixels)

    /** La zone à montrer, en fractions de la scène ; `null` quand il n'y a rien à resserrer. */
    fun focus(scene: SceneV3): SceneRect? {
        val fond = SceneShape.backgroundMedia(scene)
        val bande = SceneShape.backgroundAspect(scene)?.takeIf { fond != null && it.isFinite() && it > 0 }?.let(SceneShape::mediaBand)
        val objets = scene.objects
            .filter { SceneShape.paintsPixels(it) && it.id != fond?.id }
            .map(SceneShape::anchorBox)
            .reduceOrNull(::union)
            ?.let(::enforceMinimum)
        val cadre = listOfNotNull(bande, objets).reduceOrNull(::union) ?: return null
        val resultat = clampToScene(SceneRect(0.0, cadre.top, 1.0, cadre.bottom))
        return resultat.takeIf { it.height < WHOLE_HEIGHT }
    }

    /** Le rapport largeur / hauteur de la carte qui montre [focus] ; `null` sans cadre. */
    fun cardAspect(scene: SceneV3): Double? {
        val cadre = focus(scene)?.takeIf { it.height > 0 } ?: return null
        return (cadre.width * SceneShape.ASPECT) / cadre.height
    }

    /**
     * La scène qui n'est QU'UNE image, intacte (ni zoom, ni rotation, ni recadrage, ni mouvement, rien d'autre de visible) : elle
     * se montre à son rapport, plus large que la scène. `null` sinon.
     */
    fun imageAspect(scene: SceneV3): Double? {
        val fond = SceneShape.backgroundMedia(scene)?.takeIf(SceneShape::carriesPicture) ?: return null
        val rapport = SceneShape.declaredAspect(fond)?.takeIf { it > SceneShape.ASPECT } ?: return null
        if (!isUntouched(fond)) return null
        if (scene.objects.any { it.id != fond.id && SceneShape.paintsPixels(it) }) return null
        return rapport
    }

    /** La fenêtre de cadrage de la carte : [focus], sauf pour une scène qui n'est qu'une image, montrée à son rapport. */
    fun cardFocus(scene: SceneV3): SceneRect? = if (imageAspect(scene) == null) focus(scene) else null

    /**
     * Où poser la scène pour que [focus] COUVRE la boîte et y soit centré (un `fill`, jamais un `fit` : du vide dans un cadrage
     * est exactement ce qu'on venait retirer). Le décalage se compte sur la scène AGRANDIE.
     */
    fun placement(focus: SceneRect, boxWidth: Double, boxHeight: Double): Placement {
        val largeur = max(boxWidth / focus.width, boxHeight * SceneShape.ASPECT / focus.height)
        val hauteur = largeur / SceneShape.ASPECT
        val debordX = focus.width * largeur - boxWidth
        val debordY = focus.height * hauteur - boxHeight
        return Placement(x = -focus.left * largeur - debordX / 2, y = -focus.top * hauteur - debordY / 2, width = largeur, height = hauteur)
    }

    /**
     * Où poser la scène dans une TUILE de mosaïque, dont le rapport vient de la géométrie et non du contenu : la scène garde
     * l'échelle qui couvre la tuile (une tuile ne zoome jamais) et glisse pour y centrer [focus], sans jamais découvrir le fond.
     * Sans cadre, c'est le cadrage au centre.
     */
    fun tilePlacement(focus: SceneRect?, boxWidth: Double, boxHeight: Double): Placement {
        val largeur = max(boxWidth, boxHeight * SceneShape.ASPECT)
        val hauteur = largeur / SceneShape.ASPECT
        val zone = focus ?: SceneShape.UNIT_RECT
        val x = (boxWidth / 2 - (zone.left + zone.right) / 2 * largeur).coerceIn(boxWidth - largeur, 0.0)
        val y = (boxHeight / 2 - (zone.top + zone.bottom) / 2 * hauteur).coerceIn(boxHeight - hauteur, 0.0)
        return Placement(x = x, y = y, width = largeur, height = hauteur)
    }

    private fun isUntouched(fond: ObjectV3): Boolean {
        if (abs(fond.transform.scale - 1) >= UNTOUCHED_TOLERANCE) return false
        if (abs(fond.transform.rotation) >= UNTOUCHED_TOLERANCE) return false
        if (!fond.timing?.keyframes.isNullOrEmpty()) return false
        if (fond.anchor.t != "free" || abs(fond.anchor.x - 0.5) >= UNTOUCHED_TOLERANCE || abs(fond.anchor.y - 0.5) >= UNTOUCHED_TOLERANCE) return false
        return declaredCropIsFull(fond.payload)
    }

    private fun declaredCropIsFull(payload: JsonObject): Boolean {
        val bornes = listOf("cropX", "cropY", "cropW", "cropH").mapNotNull { (payload[it] as? JsonPrimitive)?.doubleOrNull }
        if (bornes.size < CROP_BOUNDS) return true
        val (x, y, w, h) = bornes.map { it.coerceIn(0.0, 1.0) }
        return x < UNTOUCHED_TOLERANCE && y < UNTOUCHED_TOLERANCE && w > 1 - UNTOUCHED_TOLERANCE && h > 1 - UNTOUCHED_TOLERANCE
    }

    private fun union(a: SceneRect, b: SceneRect): SceneRect =
        SceneRect(min(a.left, b.left), min(a.top, b.top), max(a.right, b.right), max(a.bottom, b.bottom))

    private fun enforceMinimum(rect: SceneRect): SceneRect {
        val dx = ((MINIMUM_SIDE - rect.width) / 2).coerceAtLeast(0.0)
        val dy = ((MINIMUM_SIDE - rect.height) / 2).coerceAtLeast(0.0)
        return SceneRect(rect.left - dx, rect.top - dy, rect.right + dx, rect.bottom + dy)
    }

    private fun clampToScene(rect: SceneRect): SceneRect {
        val (left, right) = clampSpan(rect.left, rect.width)
        val (top, bottom) = clampSpan(rect.top, rect.height)
        return SceneRect(left, top, right, bottom)
    }

    private fun clampSpan(start: Double, length: Double): Pair<Double, Double> {
        if (length >= 1) return 0.0 to 1.0
        val debut = start.coerceIn(0.0, 1 - length)
        return debut to debut + length
    }
}

/** La forme d'un carrousel de scènes (iOS `SceneCarouselLayout`) : sa page la plus HAUTE, pour ne rogner aucune page. */
object SceneCarouselLayout {

    fun cardAspect(scenes: List<SceneV3>): Double = scenes.mapNotNull(::pageAspect).minOrNull() ?: SceneShape.ASPECT

    /** Le rapport d'une page : celui de son cadrage, le gabarit 9:16 sans cadrage, rien pour une scène qui ne montre rien. */
    fun pageAspect(scene: SceneV3): Double? =
        SceneFraming.cardAspect(scene) ?: SceneShape.ASPECT.takeIf { SceneFraming.showsSomething(scene) }
}
