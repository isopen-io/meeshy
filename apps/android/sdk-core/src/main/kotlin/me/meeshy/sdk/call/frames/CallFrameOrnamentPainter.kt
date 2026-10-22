package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameOrnament
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentMotionPlan
import me.meeshy.sdk.model.call.frames.CallFrameRect

/**
 * Le peintre des ornements d'un cadre, branché sur la couture [CallFrameExtraPainter] du rendu : les
 * ornements `back` se posent dans le fond, les `front` après la bordure.
 *
 * [text] et [headline] sont l'encombrement des textes des réserves (aucun ornement semé ne s'y pose) et le
 * titre que le ruban habille. [elapsed] (secondes) fait vivre les ornements `loop` et `onAppear` ; sous
 * [reduceMotion] — ou en aperçu, sans durée — le dessin est STATIQUE. La clé de scène ne change à
 * chaque image que si un ornement s'anime vraiment : un cadre immobile garde ses couches en cache.
 */
class CallFrameOrnamentPainter(
    ornaments: List<CallFrameOrnament>,
    private val text: List<CallFrameRect> = emptyList(),
    private val headline: CallFrameRect? = null,
    private val elapsed: Double = 0.0,
    private val reduceMotion: Boolean = false,
) : CallFrameExtraPainter {

    private val animating = ornaments.any { CallFrameOrnamentMotionPlan.animates(it.motion, elapsed, reduceMotion) }

    override val cacheKey: String =
        "orn:${text.hashCode()}:${headline.hashCode()}:" + if (animating) "t${(elapsed * FRAMES_PER_SECOND).toLong()}" else "still"

    override fun paintBack(canvas: Canvas, stage: CallFrameStage) = paint(canvas, stage, CallFrameLayer.BACK)

    override fun paintFront(canvas: Canvas, stage: CallFrameStage) = paint(canvas, stage, CallFrameLayer.FRONT)

    private fun paint(canvas: Canvas, stage: CallFrameStage, layer: CallFrameLayer) =
        CallFrameRendererOrnaments.paintAll(canvas, stage, layer, text, headline, elapsed, reduceMotion)

    companion object {
        /** Le pas d'animation du cadre en direct : au plus quinze images d'ornement par seconde, jamais plus que le budget de trame. */
        const val FRAMES_PER_SECOND: Int = 15
    }
}
