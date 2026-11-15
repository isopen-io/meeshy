package me.meeshy.sdk.call.frames

import android.graphics.Canvas
import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameLayerCacheRenderTest {

    private class CountingPainter(override val cacheKey: String = "v1") : CallFrameExtraPainter {
        var back = 0
        var front = 0
        override fun paintBack(canvas: Canvas, stage: CallFrameStage) { back++ }
        override fun paintFront(canvas: Canvas, stage: CallFrameStage) { front++ }
    }

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private val frame = testFrame()
    private val faces = listOf(portrait("a"), portrait("b"))

    private fun render(
        painter: CallFrameExtraPainter,
        width: Int = 108,
        height: Int = 192,
        date: String = "22 oct.",
        people: List<CallFramePortrait> = faces,
    ) = CallFrameRenderer.render(frame, people, testTexts(date), width, height, extras = painter)

    @Test
    fun `une scene identique ne repeint pas les couches`() {
        val painter = CountingPainter()
        render(painter)
        render(painter)
        render(painter)
        assertThat(painter.back).isEqualTo(1)
        assertThat(painter.front).isEqualTo(1)
    }

    @Test
    fun `les couches sont repeintes quand les personnes, les textes ou la taille changent`() {
        val painter = CountingPainter()
        render(painter)
        render(painter, people = listOf(portrait("a"), portrait("c")))
        render(painter, date = "23 oct.")
        render(painter, width = 216, height = 384)
        assertThat(painter.back).isEqualTo(4)
    }

    @Test
    fun `la cle des peintres d extras entre dans la cle de scene`() {
        val first = CountingPainter("v1")
        val second = CountingPainter("v2")
        render(first)
        render(second)
        assertThat(first.back).isEqualTo(1)
        assertThat(second.back).isEqualTo(1)
    }

    @Test
    fun `un autre visage ne repeint pas les couches quand les personnes sont les memes`() {
        val painter = CountingPainter()
        render(painter, people = listOf(portrait("a", image = solid(1)), portrait("b")))
        render(painter, people = listOf(portrait("a", image = solid(2)), portrait("b")))
        assertThat(painter.back).isEqualTo(1)
    }

    @Test
    fun `la purge force un nouveau peintre`() {
        val painter = CountingPainter()
        render(painter)
        CallFrameRenderer.purgeLayers()
        render(painter)
        assertThat(painter.back).isEqualTo(2)
    }

    @Test
    fun `les couches gardees se relisent sans rien peindre`() {
        val painter = CountingPainter()
        val stage = CallFrameStage(frame, faces.map { it.person }, testTexts(), 108, 192)
        assertThat(CallFrameRenderer.cachedLayers(stage, painter)).isNull()
        render(painter)
        assertThat(CallFrameRenderer.cachedLayers(stage, painter)).isNotNull()
        assertThat(painter.back).isEqualTo(1)
    }

    @Test
    fun `une toile ponctuelle ne s installe pas dans le cache`() {
        val painter = CountingPainter()
        val stage = CallFrameStage(frame, faces.map { it.person }, testTexts(), 108, 192)
        CallFrameRenderer.layers(stage, painter, caching = false)
        assertThat(CallFrameRenderer.cachedLayers(stage, painter)).isNull()
    }
}
