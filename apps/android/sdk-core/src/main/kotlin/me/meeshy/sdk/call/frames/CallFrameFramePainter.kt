package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameOrnament
import me.meeshy.sdk.model.call.frames.CallFrameSceneDepth

/**
 * **TOUT CE QU'UN CADRE PEINT AUTOUR DES VISAGES** (#13694, #13695, miroir de iOS `renderBackdrop` /
 * `renderOverlay`) : la matière de sa scène sous les ornements du fond ; la moulure sur les traits des cases ;
 * les ornements, qui évitent les textes des réserves et habillent le titre ; puis — dans le DESSUS, une seule
 * fois par scène — les noms, le titre, le sous-titre et la signature. C'est le peintre que le cadre en direct,
 * la vignette et la capture partagent : un même cadre écrit les mêmes mots partout.
 *
 * L'encombrement des textes dépend de la scène (taille, personnes, textes), qui est déjà dans la clé des
 * couches : il se recalcule au moment de peindre, sans entrer dans [cacheKey].
 */
class CallFrameFramePainter(
    ornaments: List<CallFrameOrnament>,
    private val elapsed: Double = 0.0,
    private val reduceMotion: Boolean = false,
    /** Les rangs que ces couches ne peignent pas : ils se jouent animés au-dessus (#13687). */
    private val excluded: Set<Int> = emptySet(),
    /** Les illustrations de la scène ; celles que l'app a installées par défaut. */
    private val images: CallFrameSceneImageProviding = CallFrameSceneImages.installed,
) : CallFrameExtraPainter {

    override val cacheKey: String =
        "frame:" + (if (images === CallFrameSceneImageProviding.None) "bare:" else "") +
            CallFrameOrnamentPainter(ornaments, elapsed = elapsed, reduceMotion = reduceMotion, excluded = excluded).cacheKey

    override fun paintBack(canvas: Canvas, stage: CallFrameStage) {
        CallFrameSceneImagePainter.paint(canvas, stage, CallFrameSceneDepth.BACK, images)
        val layout = CallFrameRendererText.layout(stage)
        CallFrameRendererOrnaments.paintAll(canvas, stage, CallFrameLayer.BACK, layout.boxes, layout.headline, elapsed, reduceMotion, excluded)
    }

    override fun paintFront(canvas: Canvas, stage: CallFrameStage) {
        val fonts = CallFrameFontBook()
        val layout = CallFrameRendererText.layout(stage, fonts)
        CallFrameSceneImagePainter.paint(canvas, stage, CallFrameSceneDepth.FRONT, images)
        CallFrameRendererOrnaments.paintAll(canvas, stage, CallFrameLayer.FRONT, layout.boxes, layout.headline, elapsed, reduceMotion, excluded)
        CallFrameRendererText.paintTexts(canvas, stage, layout.plan, fonts)
    }
}
