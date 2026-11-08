package me.meeshy.sdk.model.scene

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Le toucher sur le canevas d'édition : quel objet est sous le doigt ? Hit-test de HAUT en BAS selon le z,
 * en tenant compte de la rotation et de l'échelle de chaque objet (le rectangle touchable est celui
 * qu'on voit, tourné). Miroir de `hitTestItem` / `hitTestForegroundItem` / `resolveManipulationTarget`.
 * Pur : aucun type Compose, les tailles de base arrivent par [sizeOf] ([defaultSize] à défaut).
 */
public object SceneHitTester {

    private const val DEG_TO_RAD: Double = Math.PI / 180.0
    private const val TEXT_CHAR_WIDTH: Double = 0.6
    private const val TEXT_LINE_HEIGHT: Double = 1.25
    private const val PLACE_PILL: Double = 360.0
    private const val PLACE_PILL_HEIGHT: Double = 96.0
    private const val AUDIO_CHIP: Double = 480.0
    private const val AUDIO_CHIP_HEIGHT: Double = 120.0

    /** L'objet touché (verrouillé ou non : c'est l'appelant qui décide de le laisser bouger). */
    public data class Target(val id: String, val obj: MeeshySceneObject, val isLocked: Boolean)

    /** Un objet verrouillé (le badge d'attribution d'une republication) ne se déplace pas. */
    public fun isLocked(obj: MeeshySceneObject): Boolean = (obj as? MeeshySceneObject.Text)?.value?.isLocked == true

    /** La taille d'un objet à l'échelle 1, en pixels du canevas de [canvasWidth] de large. */
    public fun defaultSize(obj: MeeshySceneObject, canvasWidth: Double): CanvasSize {
        val factor = CanvasGeometry.scaleFactor(canvasWidth)
        return when (obj) {
            is MeeshySceneObject.Media -> ForegroundMediaFrame.renderedSize(obj.value.aspectRatio, 1.0, canvasWidth)
            is MeeshySceneObject.Sticker -> {
                val side = SceneObjectNumbers.stickerSideFraction(obj.value.baseSize, 1.0) * canvasWidth
                CanvasSize(side, side)
            }
            is MeeshySceneObject.Text -> {
                val lines = obj.value.text.split('\n')
                val widest = lines.maxOf { it.length }.coerceAtLeast(1)
                val font = SceneObjectNumbers.fontSize(obj.value.fontSize)
                CanvasSize(widest * font * TEXT_CHAR_WIDTH * factor, lines.size * font * TEXT_LINE_HEIGHT * factor)
            }
            is MeeshySceneObject.Place -> CanvasSize(PLACE_PILL * factor, PLACE_PILL_HEIGHT * factor)
            is MeeshySceneObject.Audio -> CanvasSize(AUDIO_CHIP * factor, AUDIO_CHIP_HEIGHT * factor)
        }
    }

    /**
     * L'objet du dessus au point ([px], [py]) en pixels du canevas, ou `null`. Les fonds ne sont jamais
     * touchés ici. [minTouchPx] est le plus petit côté touchable (cible tactile, avant échelle).
     */
    public fun hit(
        lists: SceneLists,
        px: Double,
        py: Double,
        canvas: CanvasSize,
        minTouchPx: Double = 0.0,
        sizeOf: (MeeshySceneObject) -> CanvasSize = { defaultSize(it, canvas.width) },
    ): MeeshySceneObject? {
        if (!canvas.isRenderable || !px.isFinite() || !py.isFinite()) return null
        return lists.sceneObjects.asReversed().firstOrNull { obj ->
            !obj.isBackground && contains(obj, px, py, canvas, minTouchPx, sizeOf(obj))
        }
    }

    /** La cible d'un geste qui commence en ([px], [py]), selon la couche active. */
    public fun target(
        lists: SceneLists,
        layer: SceneManipulationLayer,
        px: Double,
        py: Double,
        canvas: CanvasSize,
        minTouchPx: Double = 0.0,
        sizeOf: (MeeshySceneObject) -> CanvasSize = { defaultSize(it, canvas.width) },
    ): Target? {
        val found = when (layer) {
            SceneManipulationLayer.CANVAS -> null
            SceneManipulationLayer.BACKGROUND -> lists.sceneObjects.firstOrNull { it.isBackground && it is MeeshySceneObject.Media }
            SceneManipulationLayer.FOREGROUND -> hit(lists, px, py, canvas, minTouchPx, sizeOf)
        }
        return found?.let { Target(it.id, it, isLocked(it)) }
    }

    private fun contains(
        obj: MeeshySceneObject,
        px: Double,
        py: Double,
        canvas: CanvasSize,
        minTouchPx: Double,
        base: CanvasSize,
    ): Boolean {
        val scale = SceneObjectScalePolicy.served(obj.scale)
        val halfW = maxOf(base.width, minTouchPx) * scale / 2.0
        val halfH = maxOf(base.height, minTouchPx) * scale / 2.0
        val dx = px - SceneObjectNumbers.position(obj.x) * canvas.width
        val dy = py - SceneObjectNumbers.position(obj.y) * canvas.height
        val angle = -SceneObjectNumbers.rotation(obj.rotation) * DEG_TO_RAD
        val lx = dx * cos(angle) - dy * sin(angle)
        val ly = dx * sin(angle) + dy * cos(angle)
        return abs(lx) <= halfW + EPS && abs(ly) <= halfH + EPS
    }

    private const val EPS: Double = 1e-9
}
