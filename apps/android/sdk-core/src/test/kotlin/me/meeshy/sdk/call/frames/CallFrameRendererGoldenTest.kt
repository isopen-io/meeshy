package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameBorderKind
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFramePatternKind
import me.meeshy.sdk.model.call.frames.CallFrameShapeGeometry
import me.meeshy.sdk.model.call.frames.CallFrameSlotShape
import me.meeshy.sdk.model.call.frames.CallFrameTone
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameRendererGoldenTest {

    private val faces = listOf(portrait("p1", image = solid(Color.RED)), portrait("p2", image = solid(Color.RED)))

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private fun render(frame: CallFrameDesign, width: Int, height: Int): Bitmap =
        requireNotNull(CallFrameRenderer.render(frame, faces, testTexts(), width, height)) { "rendu nul" }

    private fun reduced(large: Bitmap, width: Int, height: Int): Bitmap = Bitmap.createScaledBitmap(large, width, height, true)

    private fun isRed(pixel: Int) = Color.red(pixel) > 200 && Color.green(pixel) < 60 && Color.blue(pixel) < 60

    private fun stageOf(frame: CallFrameDesign, width: Int, height: Int) =
        CallFrameStage(frame, faces.map { it.person }, testTexts(), width, height)

    @Test
    fun `chacune des quinze formes peint un visage dans sa case et laisse le fond hors de la forme`() {
        CallFrameSlotShape.entries.forEach { shape ->
            val frame = testFrame(shape = shape)
            val bitmap = render(frame, 216, 384)
            val box = stageOf(frame, 216, 384).boxes.first()
            val inner = CallFrameShapeGeometry.shapeInnerRect(box.shape, box.rect)
            assertWithMessage(shape.raw, isRed(bitmap.getPixel(inner.midX.toInt(), inner.midY.toInt())))
        }
    }

    @Test
    fun `les formes qui coupent leurs coins laissent le coin de la case au fond`() {
        listOf(
            CallFrameSlotShape.CIRCLE, CallFrameSlotShape.OVAL, CallFrameSlotShape.DIAMOND, CallFrameSlotShape.HEART,
            CallFrameSlotShape.STAR, CallFrameSlotShape.HEX, CallFrameSlotShape.FRAME_OVAL, CallFrameSlotShape.ARCH,
        ).forEach { shape ->
            val frame = testFrame(shape = shape)
            val bitmap = render(frame, 216, 384)
            val box = stageOf(frame, 216, 384).boxes.first()
            val corner = bitmap.getPixel(box.rect.minX.toInt() + 2, box.rect.minY.toInt() + 2)
            assertWithMessage(shape.raw, channelDistance(corner, BACKGROUND_PIXEL) < 12)
        }
    }

    @Test
    fun `une vignette 108x192 et une capture 1080x1920 montrent le meme dessin pour chaque forme`() {
        CallFrameSlotShape.entries.forEach { shape ->
            val frame = testFrame(shape = shape)
            val small = render(frame, 108, 192)
            val large = reduced(render(frame, 1080, 1920), 108, 192)
            assertThat(meanDifference(small, large)).isLessThan(0.06)
        }
    }

    @Test
    fun `une vignette et une capture montrent le meme dessin pour chaque motif et chaque bordure`() {
        val variants = CallFramePatternKind.entries.map { testFrame(shape = CallFrameSlotShape.ROUND, pattern = it) } +
            CallFrameBorderKind.entries.map { testFrame(shape = CallFrameSlotShape.ROUND, border = it) }
        variants.forEach { frame ->
            val small = render(frame, 108, 192)
            val large = reduced(render(frame, 1080, 1920), 108, 192)
            assertThat(meanDifference(small, large)).isLessThan(0.15)
        }
    }

    @Test
    fun `les quatorze motifs marquent le fond`() {
        val plain = render(testFrame(shape = CallFrameSlotShape.ROUND), 540, 960)
        CallFramePatternKind.entries.forEach { kind ->
            val withPattern = render(testFrame(shape = CallFrameSlotShape.ROUND, pattern = kind), 540, 960)
            assertWithMessage(kind.raw, changedPixels(plain, withPattern) > 50)
        }
    }

    @Test
    fun `les quatorze bordures marquent la toile`() {
        val plain = render(testFrame(shape = CallFrameSlotShape.ROUND), 540, 960)
        CallFrameBorderKind.entries.forEach { kind ->
            val withBorder = render(testFrame(shape = CallFrameSlotShape.ROUND, border = kind), 540, 960)
            assertWithMessage(kind.raw, changedPixels(plain, withBorder) > 50)
        }
    }

    @Test
    fun `le ton mono grise le visage`() {
        val frame = testFrame(shape = CallFrameSlotShape.RECT, tone = CallFrameTone.MONO)
        val bitmap = render(frame, 216, 384)
        val box = stageOf(frame, 216, 384).boxes.first()
        val pixel = bitmap.getPixel(box.rect.midX.toInt(), box.rect.midY.toInt())
        assertThat(kotlin.math.abs(Color.red(pixel) - Color.green(pixel))).isAtMost(6)
        assertThat(kotlin.math.abs(Color.green(pixel) - Color.blue(pixel))).isAtMost(6)
    }

    @Test
    fun `un fond opaque couvre toute la toile`() {
        val bitmap = render(testFrame(shape = CallFrameSlotShape.CIRCLE), 108, 192)
        assertThat(Color.alpha(bitmap.getPixel(0, 0))).isEqualTo(255)
        assertThat(Color.alpha(bitmap.getPixel(107, 191))).isEqualTo(255)
    }

    @Test
    fun `une taille nulle ne rend rien`() {
        assertThat(CallFrameRenderer.render(testFrame(), faces, testTexts(), 0, 192)).isNull()
        assertThat(CallFrameRenderer.render(testFrame(), faces, testTexts(), 108, 0)).isNull()
    }

    private fun assertWithMessage(message: String, condition: Boolean) {
        com.google.common.truth.Truth.assertWithMessage(message).that(condition).isTrue()
    }
}
