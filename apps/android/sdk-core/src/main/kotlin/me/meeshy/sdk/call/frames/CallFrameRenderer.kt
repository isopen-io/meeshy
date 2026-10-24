package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Canvas
import me.meeshy.sdk.model.call.frames.CallFrameAreas
import me.meeshy.sdk.model.call.frames.CallFrameChromeReserve
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameLayerKey
import me.meeshy.sdk.model.call.frames.CallFrameLayoutGeometry
import me.meeshy.sdk.model.call.frames.CallFrameLook
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameSlotBox
import me.meeshy.sdk.model.call.frames.CallFrameTexts

/**
 * Tout ce qu'un rendu sait d'un cadre, calculé UNE fois : zones, cases, personnes, textes. `width` et
 * `height` sont des pixels : la même scène en 108 × 192 et en 1080 × 1920 donne le même dessin, car tout
 * se mesure en `unit` (le petit côté de la toile).
 */
class CallFrameStage(
    val frame: CallFrameDesign,
    val people: List<CallFramePerson>,
    val texts: CallFrameTexts,
    val width: Int,
    val height: Int,
    /** Les bandes que des contrôles couvrent à l'écran (#9777) : aucun texte du cadre ne s'y pose. */
    val reserve: CallFrameChromeReserve = CallFrameChromeReserve.NONE,
) {
    val bounds: CallFrameRect = CallFrameRect(0.0, 0.0, width.toDouble(), height.toDouble())
    val areas: CallFrameAreas =
        CallFrameLayoutGeometry.areas(frame.look.layout, width.toDouble(), height.toDouble(), reserve)
    val boxes: List<CallFrameSlotBox> =
        CallFrameLayoutGeometry.slots(frame, people.size, width.toDouble(), height.toDouble(), reserve)
    val look: CallFrameLook get() = frame.look
    val unit: Double get() = areas.unit

    /** L'encombrement de chaque case une fois tournée — ce qu'un ornement de premier plan évite. */
    val footprints: List<CallFrameRect> get() = boxes.map { CallFrameRenderKit.footprint(it) }
}

/**
 * La couture des autres peintres du cadre (ornements, noms, titre, sous-titre, signature) : ils se posent
 * dans le FOND (`paintBack`, sous les cases) et dans le DESSUS (`paintFront`, après la bordure). Leur
 * [cacheKey] entre dans la clé de scène : changer un ornement repeint les couches, rien d'autre.
 */
interface CallFrameExtraPainter {
    val cacheKey: String
    fun paintBack(canvas: Canvas, stage: CallFrameStage) {}
    fun paintFront(canvas: Canvas, stage: CallFrameStage) {}

    object None : CallFrameExtraPainter {
        override val cacheKey: String = ""
    }
}

/**
 * **LE PEINTRE DES CADRES DE CAPTURE** (#8741, spec § 5) — interprète un `CallFrameDesign` sur un canevas
 * Android (y vers le bas), dans l'ordre du § 5.1 : fond → motif → ornements `back` → cartes/ombres/halos →
 * visages → traits de case → bordure → ornements `front` → noms → titre/sous-titre → signature.
 *
 * Le rendu est en COUCHES (§ 5.5) : ce qui ne dépend pas des visages se peint une fois par scène
 * ([CallFrameLayerKey]) et se réutilise à chaque image ; par image, seuls les visages se dessinent. Le cache
 * est borné (~48 Mo). Le miroir iOS est `CallFrameRenderer.swift` ; les formules vivent dans `:core:model`.
 */
object CallFrameRenderer {
    const val LAYER_COST_LIMIT: Long = 48L * 1024 * 1024

    private val layerCache = CallFrameLayerCache<CallFrameLayers>(LAYER_COST_LIMIT) { it.cost }

    /** Le cadre complet à la taille donnée : couches + visages ; `null` si la taille est nulle ou le rendu échoue. */
    fun render(
        frame: CallFrameDesign,
        portraits: List<CallFramePortrait>,
        texts: CallFrameTexts,
        width: Int,
        height: Int,
        reserve: CallFrameChromeReserve = CallFrameChromeReserve.NONE,
        extras: CallFrameExtraPainter = CallFrameExtraPainter.None,
    ): Bitmap? {
        if (width < 1 || height < 1) return null
        val stage = CallFrameStage(frame, portraits.map { it.person }, texts, width, height, reserve)
        val cached = layers(stage, extras) ?: return null
        val bitmap = createBitmap(width, height) ?: return null
        val canvas = Canvas(bitmap)
        canvas.drawBitmap(cached.backdrop, 0f, 0f, null)
        stage.boxes.zip(portraits).forEach { (box, portrait) -> CallFrameRendererShapes.drawFace(canvas, portrait, box, stage) }
        canvas.drawBitmap(cached.overlay, 0f, 0f, null)
        return bitmap
    }

    fun purgeLayers() = layerCache.purge()

    fun layers(stage: CallFrameStage, extras: CallFrameExtraPainter = CallFrameExtraPainter.None): CallFrameLayers? =
        layers(stage, extras, caching = true)

    /**
     * `caching = false` peint sans rien garder : une toile ponctuelle (la photo d'une prise, à sa pleine
     * définition) n'évince pas les couches qui servent à chaque image.
     */
    fun layers(stage: CallFrameStage, extras: CallFrameExtraPainter, caching: Boolean): CallFrameLayers? {
        val key = layerKey(stage, extras)
        layerCache.get(key)?.let { return it }
        val backdrop = renderBackdrop(stage, extras) ?: return null
        val overlay = renderOverlay(stage, extras) ?: return null
        val painted = CallFrameLayers(backdrop, overlay)
        if (caching) layerCache.put(key, painted)
        return painted
    }

    /** Les couches déjà gardées pour cette scène, sans rien peindre. */
    fun cachedLayers(stage: CallFrameStage, extras: CallFrameExtraPainter = CallFrameExtraPainter.None): CallFrameLayers? =
        layerCache.get(layerKey(stage, extras))

    fun layerKey(stage: CallFrameStage, extras: CallFrameExtraPainter = CallFrameExtraPainter.None): String =
        CallFrameLayerKey.of(
            stage.frame.id, stage.people, stage.texts, stage.width.toDouble(), stage.height.toDouble(),
            stage.reserve, extras.cacheKey,
        )

    fun renderBackdrop(stage: CallFrameStage, extras: CallFrameExtraPainter = CallFrameExtraPainter.None): Bitmap? {
        val bitmap = createBitmap(stage.width, stage.height) ?: return null
        val canvas = Canvas(bitmap)
        CallFrameRendererDecor.paintBackground(canvas, stage)
        CallFrameRendererDecor.paintPattern(canvas, stage)
        extras.paintBack(canvas, stage)
        stage.boxes.forEach { CallFrameRendererShapes.paintUnderlay(canvas, it, stage) }
        return bitmap
    }

    fun renderOverlay(stage: CallFrameStage, extras: CallFrameExtraPainter = CallFrameExtraPainter.None): Bitmap? {
        val bitmap = createBitmap(stage.width, stage.height) ?: return null
        val canvas = Canvas(bitmap)
        stage.boxes.forEach { CallFrameRendererShapes.paintSlotStroke(canvas, it, stage) }
        CallFrameRendererDecor.paintBorder(canvas, stage)
        extras.paintFront(canvas, stage)
        return bitmap
    }

    private fun createBitmap(width: Int, height: Int): Bitmap? =
        runCatching { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }.getOrNull()
}
