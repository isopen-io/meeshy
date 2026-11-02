package me.meeshy.sdk.call.effects

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.opengl.GLES20
import android.opengl.GLUtils
import java.nio.ByteBuffer
import java.nio.FloatBuffer
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.effects.CallOrnament
import me.meeshy.sdk.model.composer.look.CallFaceEffectBudget
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import org.webrtc.GlTextureFrameBuffer
import org.webrtc.GlUtil

/** What one frame of a stylized effect is drawn with. Reused from frame to frame: it allocates nothing. */
internal class CallFaceStroke {
    var effect: CallFaceEffect = CallFaceEffect.None
    var rotation = 0
    var uprightWidth = 0f
    var uprightHeight = 0f
    var time = 0.0
    var isAnimated = true
    var isDegraded = false
    var glowTexture = 0
}

/**
 * **LES EFFETS DE VISAGE STYLISÉS SUR LA CARTE GRAPHIQUE** (#13706) — iOS `CallFaceEffectsRenderer`: crapaud, ange,
 * démon, éruption, drawn on the frame the encoder reads, after the colour. One full-frame pass ([CallFaceShaders.
 * STYLIZE]) then the drawings — halo, horns, warts, eye glows, embers — as sprites turned with the face. The drawings
 * are painted ONCE into textures (the halo and the horn are iOS's drawings, the spot is iOS's radial gradient) and
 * only placed afterwards.
 *
 * Must be created, used and released on the capture (GL) thread.
 */
internal class CallFaceEffectsGl(private val quad: FloatBuffer, private val quadTc: FloatBuffer) {
    private val stylizeProgram = lazy { CallGlProgram(CallEffectsShaders.VERTEX, CallFaceShaders.STYLIZE) }
    private val spriteProgram = lazy { CallGlProgram(CallFaceShaders.SPRITE_VERTEX, CallFaceShaders.SPRITE) }
    private val stylize by stylizeProgram
    private val sprite by spriteProgram
    private val identity = floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)
    private val embers = FloatArray(4 * CallFaceEffectBudget.EMBER_COUNT)
    private var haloTexture = 0
    private var hornTexture = 0
    private var spotTexture = 0

    /** Draws [stroke] from [stage] into [target]; [face] holds the tracked face, if any. */
    fun draw(target: GlTextureFrameBuffer, stage: Int, stroke: CallFaceStroke, face: CallFaceFrame?) {
        val hasFace = face?.face != null
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, target.frameBufferId)
        GLES20.glViewport(0, 0, target.width, target.height)
        drawStylize(stage, stroke, if (hasFace) face else null)
        GLES20.glEnable(GLES20.GL_BLEND)
        when (stroke.effect) {
            CallFaceEffect.Toad -> if (hasFace) warts(stroke, face!!)
            CallFaceEffect.Angel -> if (hasFace) halo(stroke, face!!)
            CallFaceEffect.Demon -> if (hasFace) demon(stroke, face!!)
            CallFaceEffect.Volcano -> if (stroke.isAnimated) embers(stroke)
            CallFaceEffect.None, CallFaceEffect.Smoothing -> Unit
        }
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    }

    fun release() {
        listOf(stylizeProgram, spriteProgram).filter { it.isInitialized() }.forEach { runCatching { it.value.release() } }
        val textures = intArrayOf(haloTexture, hornTexture, spotTexture).filter { it != 0 }.toIntArray()
        if (textures.isNotEmpty()) GLES20.glDeleteTextures(textures.size, textures, 0)
        haloTexture = 0
        hornTexture = 0
        spotTexture = 0
    }

    private fun drawStylize(stage: Int, stroke: CallFaceStroke, face: CallFaceFrame?) {
        val program = stylize
        program.use()
        program.attribute("in_pos", quad)
        program.attribute("in_tc", quadTc)
        program.matrix("tex_mat", identity)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, stage)
        program.sampler("src", 0)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, stroke.glowTexture)
        program.sampler("glow", 1)
        program.uniform("glowOn", if (stroke.glowTexture != 0) 1f else 0f)
        program.uniform("effect", effectCode(stroke.effect))
        orient(program, stroke)
        program.uniform("faceOn", if (face != null) 1f else 0f)
        if (face != null) {
            for (i in 0 until 4) program.uniform4(BUMPS[i], face.bumps, i * 4)
            program.uniform4("faceBox", face.faceBox, 0)
        }
        val lava = CallFaceEffectGeometry.lavaHeight(stroke.time, stroke.uprightHeight)
        program.uniform("lava", lava, (0.75 + 0.2 * sin(stroke.time * 3.1)).toFloat())
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    }

    private fun warts(stroke: CallFaceStroke, face: CallFaceFrame) {
        val radius = CallFaceEffectGeometry.wartRadius(face.face!!.bounds)
        sourceOver()
        for (i in 0 until face.wartCount) {
            spot(stroke, face.warts[i * 2], face.warts[i * 2 + 1], radius, 0.22f, 0.38f, 0.12f, 0.9f)
        }
    }

    private fun halo(stroke: CallFaceStroke, face: CallFaceFrame) {
        val halo = face.halo ?: return
        sourceOver()
        ornament(stroke, texture(Sprite.Halo), halo, CallFaceEffectGeometry.shimmer(stroke.time))
    }

    private fun demon(stroke: CallFaceStroke, face: CallFaceFrame) {
        sourceOver()
        for (i in face.horns.indices) ornament(stroke, texture(Sprite.Horn), face.horns[i], 1f)
        val radius = CallFaceEffectGeometry.eyeGlowRadius(face.face!!.bounds, stroke.time)
        additive()
        for (i in 0 until 2) spot(stroke, face.eyes[i * 2], face.eyes[i * 2 + 1], radius, 1f, 0.12f, 0.04f, 0.95f)
    }

    private fun embers(stroke: CallFaceStroke) {
        val count = CallFaceEffectBudget.emberCount(stroke.isDegraded)
        CallFaceEffectGeometry.writeEmbers(embers, count, stroke.time, stroke.uprightWidth, stroke.uprightHeight, CallFaceEffectBudget.SEED)
        additive()
        val levels = CallFaceEffectBudget.EMBER_OPACITY_LEVELS.toFloat()
        for (i in 0 until count) {
            val level = ceil(embers[i * 4 + 3] * levels).coerceAtMost(levels) / levels
            if (level > 0f) spot(stroke, embers[i * 4], embers[i * 4 + 1], embers[i * 4 + 2], 1f, 0.6f, 0.15f, level)
        }
    }

    private fun ornament(stroke: CallFaceStroke, texture: Int, ornament: CallOrnament, alpha: Float) {
        val program = useSprite(stroke, texture)
        program.uniform("placement", ornament.centerX, ornament.centerY, ornament.width, ornament.height)
        program.uniform("turn", cos(ornament.angle), sin(ornament.angle))
        program.uniform("mirror", if (ornament.mirrored) -1f else 1f)
        program.uniform("tint", 1f, 1f, 1f, alpha)
        program.uniform("tinted", 0f)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    }

    private fun spot(stroke: CallFaceStroke, x: Float, y: Float, radius: Float, r: Float, g: Float, b: Float, a: Float) {
        val program = useSprite(stroke, texture(Sprite.Spot))
        val size = max(radius, 1f) * 2f
        program.uniform("placement", x, y, size, size)
        program.uniform("turn", 1f, 0f)
        program.uniform("mirror", 1f)
        program.uniform("tint", r, g, b, a)
        program.uniform("tinted", 1f)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    }

    private fun useSprite(stroke: CallFaceStroke, texture: Int): CallGlProgram {
        val program = sprite
        program.use()
        program.attribute("in_pos", quadTc)
        orient(program, stroke)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
        program.sampler("sprite", 0)
        return program
    }

    private fun orient(program: CallGlProgram, stroke: CallFaceStroke) {
        program.uniform("rotation", (((stroke.rotation % 360) + 360) % 360).toFloat())
        program.uniform("size", stroke.uprightWidth, stroke.uprightHeight)
    }

    private fun sourceOver() = GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)

    private fun additive() = GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE)

    private enum class Sprite { Halo, Horn, Spot }

    private fun texture(kind: Sprite): Int = when (kind) {
        Sprite.Halo -> haloTexture.takeIf { it != 0 } ?: upload(CallFaceSprites.halo()).also { haloTexture = it }
        Sprite.Horn -> hornTexture.takeIf { it != 0 } ?: upload(CallFaceSprites.horn()).also { hornTexture = it }
        Sprite.Spot -> spotTexture.takeIf { it != 0 } ?: uploadSpot().also { spotTexture = it }
    }

    private fun upload(bitmap: Bitmap): Int {
        val texture = GlUtil.generateTexture(GLES20.GL_TEXTURE_2D)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        bitmap.recycle()
        return texture
    }

    private fun uploadSpot(): Int {
        val texture = GlUtil.generateTexture(GLES20.GL_TEXTURE_2D)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
        val side = CallFaceSprites.SPOT_SIZE
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, side, side, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, ByteBuffer.wrap(CallFaceSprites.spot()))
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        return texture
    }

    private fun effectCode(effect: CallFaceEffect): Float = when (effect) {
        CallFaceEffect.Toad -> 1f
        CallFaceEffect.Angel -> 2f
        CallFaceEffect.Demon -> 3f
        CallFaceEffect.Volcano -> 4f
        CallFaceEffect.None, CallFaceEffect.Smoothing -> 0f
    }

    private companion object {
        val BUMPS = arrayOf("bump0", "bump1", "bump2", "bump3")
    }
}

/**
 * The drawings of the face effects, painted once — iOS `drawHalo`, `drawHorn` and the radial `spot`, transposed to
 * the Android canvas (y down). Premultiplied, as `GLUtils` uploads them.
 */
internal object CallFaceSprites {
    const val SPOT_SIZE: Int = 64
    private const val HALO_WIDTH = 512
    private const val HALO_HEIGHT = 146
    private const val HORN_WIDTH = 160
    private const val HORN_HEIGHT = 280

    /** The angel's golden ring, glowing — iOS `drawHalo`. */
    fun halo(): Bitmap {
        val w = HALO_WIDTH.toFloat()
        val h = HALO_HEIGHT.toFloat()
        val bitmap = Bitmap.createBitmap(HALO_WIDTH, HALO_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val lineWidth = h * 0.16f
        val inset = h * 0.24f
        val ring = RectF(inset, inset, w - inset, h - inset)
        fun stroke(width: Float, color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = width
            this.color = color
        }
        canvas.drawOval(ring, stroke(lineWidth, argb(0.95f, 1f, 0.82f, 0.3f)).apply { maskFilter = BlurMaskFilter(h * 0.22f, BlurMaskFilter.Blur.NORMAL) })
        canvas.drawOval(ring, stroke(lineWidth, argb(1f, 1f, 0.8f, 0.28f)))
        canvas.drawOval(ring, stroke(lineWidth * 0.35f, argb(0.9f, 1f, 0.97f, 0.78f)))
        return bitmap
    }

    /** The demon's left horn, its tip up and outward; the right one is its mirror — iOS `drawHorn`. */
    fun horn(): Bitmap {
        val w = HORN_WIDTH.toFloat()
        val h = HORN_HEIGHT.toFloat()
        val bitmap = Bitmap.createBitmap(HORN_WIDTH, HORN_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val path = Path().apply {
            moveTo(0.22f * w, h)
            quadTo(0.02f * w, 0.5f * h, 0.04f * w, 0.02f * h)
            quadTo(0.62f * w, 0.58f * h, 0.92f * w, h)
            close()
        }
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0.5f * w, h, 0.1f * w, 0f,
                intArrayOf(argb(1f, 0.42f, 0.02f, 0.03f), argb(1f, 0.86f, 0.1f, 0.08f), argb(1f, 1f, 0.45f, 0.3f)),
                floatArrayOf(0f, 0.65f, 1f),
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawPath(path, fill)
        canvas.drawPath(
            path,
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = max(1f, w * 0.03f)
                color = argb(0.85f, 0.2f, 0f, 0f)
            },
        )
        return bitmap
    }

    /** A white disc, full to a quarter of its radius then fading to nothing at its edge (iOS `spot`), premultiplied RGBA. */
    fun spot(): ByteArray {
        val bytes = ByteArray(SPOT_SIZE * SPOT_SIZE * 4)
        val half = SPOT_SIZE / 2f
        for (y in 0 until SPOT_SIZE) for (x in 0 until SPOT_SIZE) {
            val distance = kotlin.math.hypot(x + 0.5f - half, y + 0.5f - half) / half
            val alpha = (1f - ((distance - 0.25f) / 0.75f).coerceIn(0f, 1f))
            val value = (alpha * 255f).roundToInt().toByte()
            val at = (y * SPOT_SIZE + x) * 4
            bytes[at] = value
            bytes[at + 1] = value
            bytes[at + 2] = value
            bytes[at + 3] = value
        }
        return bytes
    }

    private fun argb(a: Float, r: Float, g: Float, b: Float): Int =
        ((a * 255).roundToInt() shl 24) or ((r * 255).roundToInt() shl 16) or ((g * 255).roundToInt() shl 8) or (b * 255).roundToInt()
}
