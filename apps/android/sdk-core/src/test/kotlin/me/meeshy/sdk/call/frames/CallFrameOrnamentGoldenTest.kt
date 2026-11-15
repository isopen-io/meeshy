package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentKind
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameOrnamentGoldenTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private fun renderKind(kind: CallFrameOrnamentKind, layer: CallFrameLayer, width: Int = 216, height: Int = 384): Bitmap {
        val frame = framed(ornament(kind, layer))
        return renderWith(frame, CallFrameOrnamentPainter(frame.look.ornaments), width, height)
    }

    private fun bare(width: Int = 216, height: Int = 384): Bitmap {
        val frame = framed()
        return renderWith(frame, CallFrameOrnamentPainter(frame.look.ornaments), width, height)
    }

    @Test
    fun `chacun des trente quatre ornements du fond laisse sa trace sur la toile`() {
        val empty = bare()
        CallFrameOrnamentKind.entries.forEach { kind ->
            assertWithMessage(kind.raw).that(changedPixels(empty, renderKind(kind, CallFrameLayer.BACK))).isGreaterThan(0)
        }
    }

    @Test
    fun `les ornements habilles de premier plan laissent leur trace sur la toile`() {
        val empty = bare()
        listOf(CallFrameOrnamentKind.TAPE, CallFrameOrnamentKind.RIBBON, CallFrameOrnamentKind.CANDLES, CallFrameOrnamentKind.REC).forEach { kind ->
            assertWithMessage(kind.raw).that(changedPixels(empty, renderKind(kind, CallFrameLayer.FRONT))).isGreaterThan(0)
        }
    }

    @Test
    fun `une vignette et une capture montrent le meme ornement`() {
        CallFrameOrnamentKind.entries.forEach { kind ->
            val small = renderKind(kind, CallFrameLayer.BACK, 108, 192)
            val large = Bitmap.createScaledBitmap(renderKind(kind, CallFrameLayer.BACK, 1080, 1920), 108, 192, true)
            assertWithMessage(kind.raw).that(meanDifference(small, large)).isLessThan(0.08)
        }
    }

    @Test
    fun `un ornement de premier plan ne couvre jamais le visage de la premiere case`() {
        val frame = framed(ornament(CallFrameOrnamentKind.CONFETTI, CallFrameLayer.FRONT), ornament(CallFrameOrnamentKind.STARS, CallFrameLayer.FRONT))
        val withOrnaments = renderWith(frame, CallFrameOrnamentPainter(frame.look.ornaments))
        val without = renderWith(framed(), CallFrameOrnamentPainter(emptyList()))
        val box = CallFrameStage(frame, listOf(portrait("p1").person, portrait("p2").person), testTexts(), 216, 384).boxes.first().rect
        val core = Bitmap.createBitmap(withOrnaments, box.minX.toInt() + 4, box.minY.toInt() + 4, box.width.toInt() - 8, box.height.toInt() - 8)
        val reference = Bitmap.createBitmap(without, box.minX.toInt() + 4, box.minY.toInt() + 4, box.width.toInt() - 8, box.height.toInt() - 8)
        assertWithMessage("visage").that(changedPixels(core, reference)).isEqualTo(0)
    }
}
