package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import me.meeshy.sdk.call.frames.CallFrameRendererKit.rectF
import me.meeshy.sdk.call.frames.CallFrameRendererKit.toPath
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameMotionPlan
import me.meeshy.sdk.model.call.frames.CallFrameMotionTrack
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentGeometry
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentPartition
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentStage
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import kotlin.math.roundToInt

/** Un ornement animé, peint une fois : une image transparente par groupe, à la taille de la toile des ornements. */
class CallFrameMotionSprite(val track: CallFrameMotionTrack, val images: List<Bitmap>)

/**
 * Ce qui bouge dans un cadre (#13687, miroir de iOS `CallFrameMotionScene`) : ses ornements animés, peints à la
 * moitié de la toile ([width] × [height], [unit] à cette taille), et le masque qui les garde hors des visages
 * (opaque là où un ornement peut se voir).
 */
class CallFrameMotionScene(
    val width: Int,
    val height: Int,
    val unit: Double,
    val mask: Bitmap,
    val sprites: List<CallFrameMotionSprite>,
)

/**
 * Les couches CUITES du cadre en direct (doc frames 06 § 4.1) : le FOND avec le visage de repli de chaque case
 * (caméra coupée ⇒ dégradé et initiale, jamais une case retirée), le DESSUS (traits de case, bordure, ornements
 * de premier plan) et les ornements animés. Peintes une fois hors du fil principal, posées telles quelles à
 * chaque image — les vidéos se glissent entre le fond et le dessus.
 */
class CallFrameLiveScene(
    val width: Int,
    val height: Int,
    val backdrop: Bitmap,
    val overlay: Bitmap,
    val motion: CallFrameMotionScene?,
)

/**
 * **LE PEINTRE DU CADRE EN DIRECT** (#13687, miroir de iOS `CallLiveFrameCompositor.paint` et
 * `CallFrameMotionRenderer`). Quand les ornements se jouent ([animates]), les couches fixes les omettent et
 * chacun se peint à part, en groupes, à la moitié de la toile : l'écran les fait bouger sans rien repeindre.
 */
object CallFrameLivePainter {
    /** Les ornements animés se peignent à la moitié de la toile : une étincelle n'a pas besoin de chaque pixel. */
    const val SPRITE_SCALE: Double = 0.5

    fun paint(stage: CallFrameStage, animates: Boolean): CallFrameLiveScene? {
        if (stage.width < 1 || stage.height < 1) return null
        val tracks = if (animates) CallFrameMotionPlan.tracks(stage.look) + CallFrameMotionPlan.sceneTracks(stage.look) else emptyList()
        val excluded = tracks.map { it.rank }.filter { it < CallFrameMotionPlan.SCENE_RANK_OFFSET }.toSet()
        val extras = CallFrameOrnamentPainter(stage.look.ornaments, excluded = excluded)
        val layers = CallFrameRenderer.layers(stage, extras) ?: return null
        val backdrop = faces(stage, layers.backdrop) ?: return null
        val motion = if (tracks.isEmpty()) null else motion(stage, tracks)
        return CallFrameLiveScene(stage.width, stage.height, backdrop, layers.overlay, motion)
    }

    /** Le fond, et dans chaque case le visage de repli : la vidéo le couvre tant que la caméra envoie une image. */
    private fun faces(stage: CallFrameStage, backdrop: Bitmap): Bitmap? {
        val bitmap = bitmap(stage.width, stage.height) ?: return null
        val canvas = Canvas(bitmap)
        canvas.drawBitmap(backdrop, 0f, 0f, null)
        stage.boxes.zip(stage.people).forEach { (box, person) ->
            val portrait = CallFramePortrait(person.id, person.name, person.handle, person.isSelf, null)
            CallFrameRendererShapes.drawFace(canvas, portrait, box, stage)
        }
        return bitmap
    }

    fun spriteSize(stage: CallFrameStage): Pair<Int, Int> =
        (stage.width * SPRITE_SCALE).roundToInt().coerceAtLeast(1) to (stage.height * SPRITE_SCALE).roundToInt().coerceAtLeast(1)

    private fun motion(stage: CallFrameStage, tracks: List<CallFrameMotionTrack>): CallFrameMotionScene? {
        val (width, height) = spriteSize(stage)
        val scale = width.toDouble() / stage.width
        val sprites = tracks.map { track -> sprite(stage, track, width, height, scale) ?: return null }
        val mask = mask(stage, width, height, scale) ?: return null
        return CallFrameMotionScene(width, height, stage.unit * scale, mask, sprites)
    }

    private fun sprite(stage: CallFrameStage, track: CallFrameMotionTrack, width: Int, height: Int, scale: Double): CallFrameMotionSprite? {
        val scene = ornamentStage(stage, track)
        val images = (0 until track.partitions).map { index ->
            val image = bitmap(width, height) ?: return null
            val canvas = Canvas(image)
            canvas.scale(scale.toFloat(), scale.toFloat())
            CallFrameRendererOrnaments.paint(canvas, track.ornament, scene, track.rank, CallFrameOrnamentPartition(index, track.partitions))
            image
        }
        return CallFrameMotionSprite(track, images)
    }

    /** Ce qui tombe ou monte se sème sur toute la toile, pour qu'en défilant il ne laisse jamais de bande vide. */
    fun ornamentStage(stage: CallFrameStage, track: CallFrameMotionTrack): CallFrameOrnamentStage {
        val base = CallFrameOrnamentGeometry.stage(stage.bounds, stage.areas, stage.boxes, track.ornament.layer == CallFrameLayer.FRONT)
        if (!track.travels) return base
        return base.copy(zones = listOf(stage.bounds), avoid = emptyList(), front = false, text = emptyList())
    }

    /** Opaque partout, sauf dans les cases (la carte entière quand la case en porte une). */
    private fun mask(stage: CallFrameStage, width: Int, height: Int, scale: Double): Bitmap? {
        val mask = bitmap(width, height) ?: return null
        val canvas = Canvas(mask)
        canvas.drawColor(android.graphics.Color.WHITE)
        canvas.scale(scale.toFloat(), scale.toFloat())
        val clear = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }
        val slot = stage.look.slot
        stage.boxes.forEach { box ->
            canvas.save()
            if (box.rotation != 0.0) canvas.rotate(box.rotation.toFloat(), box.rect.midX.toFloat(), box.rect.midY.toFloat())
            if (slot.card == null) {
                canvas.drawPath(toPath(CallFrameShapeGeometry.slotPath(box, CallFrameRenderKit.photoRect(box.rect, null), slot)), clear)
            } else {
                canvas.drawRect(rectF(box.rect), clear)
            }
            canvas.restore()
        }
        return mask
    }

    private fun bitmap(width: Int, height: Int): Bitmap? =
        runCatching { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }.getOrNull()
}
