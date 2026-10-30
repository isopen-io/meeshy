package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import me.meeshy.sdk.call.frames.CallFrameRendererKit.rectF
import me.meeshy.sdk.call.frames.CallFrameRendererKit.toPath
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameMotionPlan
import me.meeshy.sdk.model.call.frames.CallFrameMotionTrack
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentGeometry
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentPartition
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentStage
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameSceneArt
import me.meeshy.sdk.model.call.frames.CallFrameSceneLayer
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import me.meeshy.sdk.model.call.frames.CallFrameTextLayout
import kotlin.math.roundToInt

/** Un ornement animé, peint une fois : une image transparente par groupe, à la taille de la toile des ornements. */
class CallFrameMotionSprite(val track: CallFrameMotionTrack, val images: List<Bitmap>)

/**
 * Une lumière de scène (#13695, miroir de la couche radiale de iOS `CallFrameMotionLayer.ambientLayer`) : un halo
 * qui couvre la toile, plein au centre et éteint aux bords, peint une fois ; l'hôte le fait respirer
 * ([CallFrameSceneArt.lightAlpha]). [masked] : `back` et `front` restent hors des visages, `effects` passe dessus.
 */
class CallFrameMotionLight(val layer: CallFrameSceneLayer, val image: Bitmap) {
    val masked: Boolean get() = CallFrameSceneArt.isMasked(layer)
}

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
    val lights: List<CallFrameMotionLight> = emptyList(),
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
        val extras = CallFrameFramePainter(stage.look.ornaments, excluded = excluded)
        val layers = CallFrameRenderer.layers(stage, extras) ?: return null
        val backdrop = faces(stage, layers.backdrop) ?: return null
        val lights = if (animates) CallFrameSceneArt.lights(stage.look) else emptyList()
        val motion = if (tracks.isEmpty() && lights.isEmpty()) null else motion(stage, tracks, lights)
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

    private fun motion(stage: CallFrameStage, tracks: List<CallFrameMotionTrack>, lights: List<CallFrameSceneLayer>): CallFrameMotionScene? {
        val (width, height) = spriteSize(stage)
        val scale = width.toDouble() / stage.width
        val layout = CallFrameRendererText.layout(stage)
        val sprites = tracks.map { track -> sprite(stage, track, layout, width, height, scale) ?: return null }
        val mask = mask(stage, layout, width, height, scale) ?: return null
        val halos = lights.map { layer -> CallFrameMotionLight(layer, light(layer, width, height) ?: return null) }
        return CallFrameMotionScene(width, height, stage.unit * scale, mask, sprites, halos)
    }

    /** Le halo d'une lumière : sa couleur pleine au centre, transparente sur l'ellipse inscrite dans la toile. */
    private fun light(layer: CallFrameSceneLayer, width: Int, height: Int): Bitmap? {
        val image = bitmap(width, height) ?: return null
        val ink = CallFrameRenderKit.color(layer.color ?: "#FFFFFF")
        val cx = width / 2f
        val cy = height / 2f
        val shader = RadialGradient(
            cx, cy, cx, intArrayOf(CallFrameRendererKit.argb(ink), CallFrameRendererKit.argb(ink.copy(alpha = 0.0))), null, Shader.TileMode.CLAMP,
        ).apply { setLocalMatrix(Matrix().apply { setScale(1f, height.toFloat() / width, cx, cy) }) }
        Canvas(image).drawRect(0f, 0f, width.toFloat(), height.toFloat(), Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
        return image
    }

    private fun sprite(
        stage: CallFrameStage,
        track: CallFrameMotionTrack,
        layout: CallFrameTextLayout,
        width: Int,
        height: Int,
        scale: Double,
    ): CallFrameMotionSprite? {
        val scene = ornamentStage(stage, track, layout)
        val images = (0 until track.partitions).map { index ->
            val image = bitmap(width, height) ?: return null
            val canvas = Canvas(image)
            canvas.scale(scale.toFloat(), scale.toFloat())
            CallFrameRendererOrnaments.paint(canvas, track.ornament, scene, track.rank, CallFrameOrnamentPartition(index, track.partitions))
            image
        }
        return CallFrameMotionSprite(track, images)
    }

    /**
     * La scène d'un ornement animé : celle des couches fixes (qui évite les textes et habille le titre), sauf pour
     * ce qui tombe ou monte, semé sur toute la toile pour qu'en défilant il ne laisse jamais de bande vide.
     */
    fun ornamentStage(
        stage: CallFrameStage,
        track: CallFrameMotionTrack,
        layout: CallFrameTextLayout = CallFrameRendererText.layout(stage),
    ): CallFrameOrnamentStage {
        val base = CallFrameOrnamentGeometry.stage(
            stage.bounds, stage.areas, stage.boxes, track.ornament.layer == CallFrameLayer.FRONT, layout.boxes, layout.headline,
        )
        if (!track.travels) return base
        return base.copy(zones = listOf(stage.bounds), avoid = emptyList(), front = false, text = emptyList())
    }

    /** Opaque partout, sauf dans les cases (la carte entière quand la case en porte une) et sous les textes. */
    private fun mask(stage: CallFrameStage, layout: CallFrameTextLayout, width: Int, height: Int, scale: Double): Bitmap? {
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
        val margin = stage.unit * 0.01
        layout.boxes.forEach { box ->
            canvas.drawRect(rectF(CallFrameRect(box.minX - margin, box.minY - margin, box.width + margin * 2, box.height + margin * 2)), clear)
        }
        return mask
    }

    private fun bitmap(width: Int, height: Int): Bitmap? =
        runCatching { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }.getOrNull()
}
