package me.meeshy.sdk.call.frames

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
class CallFrameOrnamentSeedTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private fun render(vararg kinds: CallFrameOrnamentKind) = framed(*kinds.map { ornament(it) }.toTypedArray()).let {
        CallFrameRenderer.purgeLayers()
        renderWith(it, CallFrameOrnamentPainter(it.look.ornaments))
    }

    @Test
    fun `deux rendus successifs de la meme scene ne scintillent pas`() {
        CallFrameOrnamentKind.entries.forEach { kind ->
            assertWithMessage(kind.raw).that(sameBitmap(render(kind), render(kind))).isTrue()
        }
    }

    @Test
    fun `la graine est le rang de l ornement dans le cadre`() {
        val first = render(CallFrameOrnamentKind.STARS, CallFrameOrnamentKind.STARS)
        val again = render(CallFrameOrnamentKind.STARS, CallFrameOrnamentKind.STARS)
        val single = render(CallFrameOrnamentKind.STARS)
        assertWithMessage("rang").that(sameBitmap(first, again)).isTrue()
        assertWithMessage("deux rangs sèment deux fois").that(sameBitmap(first, single)).isFalse()
    }

    @Test
    fun `la couche du fond et celle du dessus se peignent sans se confondre`() {
        val frame = framed(ornament(CallFrameOrnamentKind.HEARTS, CallFrameLayer.BACK), ornament(CallFrameOrnamentKind.NOTES, CallFrameLayer.FRONT))
        val both = renderWith(frame, CallFrameOrnamentPainter(frame.look.ornaments))
        val backOnly = render(CallFrameOrnamentKind.HEARTS)
        assertWithMessage("dessus").that(sameBitmap(both, backOnly)).isFalse()
    }
}
