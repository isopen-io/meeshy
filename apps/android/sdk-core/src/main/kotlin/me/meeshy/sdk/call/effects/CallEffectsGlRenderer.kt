package me.meeshy.sdk.call.effects

import android.graphics.Matrix
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallColorLook
import me.meeshy.sdk.model.call.effects.CallVideoEffectsPlan
import org.webrtc.GlTextureFrameBuffer
import org.webrtc.GlUtil
import org.webrtc.RendererCommon
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max

/**
 * Draws one camera frame through the effects on the GPU, on the capture thread (whose EGL context is
 * current: it is the `SurfaceTextureHelper`'s). The output is a texture of a small pool, wrapped in a
 * `TextureBufferImpl` that the encoder reads directly (or converts with [yuv] for a software codec); the
 * slot returns to the pool when the last consumer releases the frame. No pool slot free ⇒ `null`, and
 * the caller sends the original frame: an effect may skip a frame, the camera never does.
 *
 * Must be created, used and released on [handler]'s thread.
 */
internal class CallEffectsGlRenderer(private val handler: Handler) {
    private val quad = GlUtil.createFloatBuffer(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
    private val quadTc = GlUtil.createFloatBuffer(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f))
    private val identity = floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)
    private val gradeOes by lazy { CallGlProgram(CallEffectsShaders.VERTEX, CallEffectsShaders.GRADE_OES) }
    private val gradeRgb by lazy { CallGlProgram(CallEffectsShaders.VERTEX, CallEffectsShaders.GRADE_RGB) }
    private val blur by lazy { CallGlProgram(CallEffectsShaders.VERTEX, CallEffectsShaders.BLUR) }
    private val composite by lazy { CallGlProgram(CallEffectsShaders.VERTEX, CallEffectsShaders.COMPOSITE) }
    private val base = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val smallA = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val smallB = GlTextureFrameBuffer(GLES20.GL_RGBA)
    private val slots = List(POOL_SIZE) { Slot(GlTextureFrameBuffer(GLES20.GL_RGBA)) }
    private val yuv = YuvConverter()
    private val strips = ConcurrentHashMap<VideoFilterPreset, ByteBuffer>()
    private val baking = ConcurrentHashMap.newKeySet<VideoFilterPreset>()
    private var lutTexture = 0
    private var lutPreset: VideoFilterPreset? = null
    private var maskTexture = 0
    private var maskSize = 0 to 0
    private val weights = FloatArray(7)
    private var weightsRadius = -1.0

    private class Slot(val target: GlTextureFrameBuffer) {
        val busy = AtomicBoolean(false)
    }

    /** Uploads a fresh person mask; the blur composites with the last one uploaded. */
    fun upload(mask: CallPersonMask) {
        if (maskTexture == 0) maskTexture = GlUtil.generateTexture(GLES20.GL_TEXTURE_2D)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, maskTexture)
        GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 1)
        val data = ByteBuffer.wrap(mask.values)
        if (maskSize != mask.width to mask.height) {
            GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_LUMINANCE, mask.width, mask.height, 0, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, data)
            maskSize = mask.width to mask.height
        } else {
            GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, mask.width, mask.height, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, data)
        }
        GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 4)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    }

    /**
     * The frame drawn through [plan], or `null` when no output slot is free. [withMask] composites the
     * background blur (a mask has been uploaded); without it the blur is skipped for this frame.
     */
    fun render(frame: VideoFrame, input: VideoFrame.TextureBuffer, plan: CallVideoEffectsPlan, withMask: Boolean): VideoFrame? {
        val slot = slots.firstOrNull { it.busy.compareAndSet(false, true) } ?: return null
        val width = input.width
        val height = input.height
        val blurs = plan.blur != null && withMask && maskTexture != 0
        val look = plan.look?.let(::lutReady)
        val texMatrix = RendererCommon.convertMatrixFromAndroidGraphicsMatrix(input.transformMatrix)

        slot.target.setSize(width, height)
        val gradeTarget = if (blurs) base.also { it.setSize(width, height) } else slot.target
        drawGrade(input, texMatrix, gradeTarget, plan, look, applyColor = !blurs)
        if (blurs) {
            val sw = max(1, width / 4)
            val sh = max(1, height / 4)
            smallA.setSize(sw, sh)
            smallB.setSize(sw, sh)
            updateWeights(plan.blurRadius)
            drawBlur(base.textureId, smallA, 1f / sw, 0f)
            drawBlur(smallA.textureId, smallB, 0f, 1f / sh)
            drawComposite(slot.target, smallB.textureId, plan, look, frame.rotation)
        }
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GLES20.glUseProgram(0)
        GLES20.glFinish()

        val buffer = TextureBufferImpl(
            width, height, VideoFrame.TextureBuffer.Type.RGB, slot.target.textureId, Matrix(), handler, yuv,
        ) { slot.busy.set(false) }
        return VideoFrame(buffer, frame.rotation, frame.timestampNs)
    }

    fun release() {
        listOf(gradeOes, gradeRgb, blur, composite).forEach { runCatching { it.release() } }
        base.release()
        smallA.release()
        smallB.release()
        slots.forEach { it.target.release() }
        if (lutTexture != 0) GLES20.glDeleteTextures(1, intArrayOf(lutTexture), 0)
        if (maskTexture != 0) GLES20.glDeleteTextures(1, intArrayOf(maskTexture), 0)
        lutTexture = 0
        maskTexture = 0
        yuv.release()
    }

    private fun drawGrade(
        input: VideoFrame.TextureBuffer,
        texMatrix: FloatArray,
        target: GlTextureFrameBuffer,
        plan: CallVideoEffectsPlan,
        look: VideoFilterPreset?,
        applyColor: Boolean,
    ) {
        val oes = input.type == VideoFrame.TextureBuffer.Type.OES
        val program = if (oes) gradeOes else gradeRgb
        bindTarget(target)
        program.use()
        program.attribute("in_pos", quad)
        program.attribute("in_tc", quadTc)
        program.matrix("tex_mat", texMatrix)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(if (oes) GLES11Ext.GL_TEXTURE_EXTERNAL_OES else GLES20.GL_TEXTURE_2D, input.textureId)
        program.sampler("src", 0)
        val scaleX = hypot(texMatrix[0], texMatrix[1])
        val scaleY = hypot(texMatrix[4], texMatrix[5])
        program.uniform("texel", scaleX / input.width, scaleY / input.height)
        program.uniform("smoothing", plan.smoothing)
        program.uniform("textureKept", plan.textureKept)
        program.uniform("applyColor", if (applyColor) 1f else 0f)
        bindColor(program, plan, look)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glBindTexture(if (oes) GLES11Ext.GL_TEXTURE_EXTERNAL_OES else GLES20.GL_TEXTURE_2D, 0)
    }

    private fun drawBlur(source: Int, target: GlTextureFrameBuffer, strideX: Float, strideY: Float) {
        bindTarget(target)
        blur.use()
        blur.attribute("in_pos", quad)
        blur.attribute("in_tc", quadTc)
        blur.matrix("tex_mat", identity)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, source)
        blur.sampler("src", 0)
        blur.uniform("stride", strideX, strideY)
        weights.forEachIndexed { i, w -> blur.uniform("w$i", w) }
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    }

    private fun drawComposite(target: GlTextureFrameBuffer, blurred: Int, plan: CallVideoEffectsPlan, look: VideoFilterPreset?, rotation: Int) {
        bindTarget(target)
        composite.use()
        composite.attribute("in_pos", quad)
        composite.attribute("in_tc", quadTc)
        composite.matrix("tex_mat", identity)
        bindTexture(0, base.textureId)
        composite.sampler("base", 0)
        bindTexture(1, blurred)
        composite.sampler("blurred", 1)
        bindTexture(2, maskTexture)
        composite.sampler("mask", 2)
        composite.uniform("rotation", (((rotation % 360) + 360) % 360).toFloat())
        bindColor(composite, plan, look)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        (0..3).forEach { bindTexture(it, 0) }
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    }

    private fun bindColor(program: CallGlProgram, plan: CallVideoEffectsPlan, look: VideoFilterPreset?) {
        program.uniform("brightness", plan.brightness)
        program.uniform("lutN", CallColorLook.DIMENSION.toFloat())
        if (look != null && lutTexture != 0) {
            bindTexture(3, lutTexture)
            program.sampler("lut", 3)
            program.uniform("lutOn", 1f)
        } else {
            program.uniform("lutOn", 0f)
        }
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    }

    private fun bindTexture(unit: Int, texture: Int) {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
    }

    private fun bindTarget(target: GlTextureFrameBuffer) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, target.frameBufferId)
        GLES20.glViewport(0, 0, target.width, target.height)
    }

    /**
     * The look's strip, uploaded; `null` while it is still baking. The bake (15 625 grades) runs off the
     * capture thread, once per look and per call: the frames meanwhile go out without the look, never late.
     */
    private fun lutReady(preset: VideoFilterPreset): VideoFilterPreset? {
        if (lutPreset == preset && lutTexture != 0) return preset
        val strip = strips[preset]
        if (strip == null) {
            if (baking.add(preset)) {
                Thread({
                    CallColorLook.recipe(preset)?.let { strips[preset] = ByteBuffer.wrap(CallColorLook.lutStrip(it)) }
                }, "MeeshyCallLook").start()
            }
            return null
        }
        if (lutTexture == 0) lutTexture = GlUtil.generateTexture(GLES20.GL_TEXTURE_2D)
        val (w, h) = CallColorLook.stripSize()
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, lutTexture)
        strip.position(0)
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, strip)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        lutPreset = preset
        return preset
    }

    /** Gaussian weights for a quarter-resolution blur of [radius] full-resolution pixels (iOS: σ = r/4). */
    private fun updateWeights(radius: Double) {
        if (radius == weightsRadius) return
        weightsRadius = radius
        val sigma = max(radius * 0.25, 0.5)
        val raw = DoubleArray(7) { exp(-(it * it) / (2 * sigma * sigma)) }
        val total = raw[0] + 2 * raw.drop(1).sum()
        raw.forEachIndexed { i, w -> weights[i] = (w / total).toFloat() }
    }

    private companion object {
        const val POOL_SIZE = 4
    }
}
