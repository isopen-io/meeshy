package me.meeshy.sdk.call.frames

import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFramePlaceholder
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit
import me.meeshy.sdk.model.call.frames.CallFrameSlotShape
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFramePortraitTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private val frame = testFrame(shape = CallFrameSlotShape.RECT)

    private fun render(portraits: List<CallFramePortrait>) =
        requireNotNull(CallFrameRenderer.render(frame, portraits, testTexts(), 216, 384))

    private fun boxes(count: Int) =
        CallFrameStage(frame, (1..count).map { portrait("p$it").person }, testTexts(), 216, 384).boxes

    private fun argb(hex: String): Int = CallFrameRendererKit.argb(CallFrameRenderKit.color(hex))

    @Test
    fun `un portrait absent affiche le degrade de la personne sans retirer la case`() {
        val bitmap = render(listOf(portrait("a"), portrait("b")))
        boxes(2).forEach { box ->
            val pixel = bitmap.getPixel(box.rect.minX.toInt() + 6, box.rect.minY.toInt() + 6)
            assertThat(channelDistance(pixel, BACKGROUND_PIXEL)).isGreaterThan(20)
        }
    }

    @Test
    fun `le degrade du portrait absent part de la premiere teinte de la personne`() {
        val hues = CallFramePlaceholder.hues("a")
        val bitmap = render(listOf(portrait("a"), portrait("b")))
        val box = boxes(2).first()
        val pixel = bitmap.getPixel(box.rect.minX.toInt() + 4, box.rect.minY.toInt() + 4)
        assertThat(channelDistance(pixel, argb(hues.first))).isLessThan(channelDistance(pixel, argb(hues.second)))
    }

    @Test
    fun `un nom vide garde quand meme le degrade`() {
        val bitmap = render(listOf(portrait("a", name = "   "), portrait("b", name = "")))
        val box = boxes(2).last()
        val pixel = bitmap.getPixel(box.rect.minX.toInt() + 6, box.rect.minY.toInt() + 6)
        assertThat(channelDistance(pixel, BACKGROUND_PIXEL)).isGreaterThan(20)
    }

    @Test
    fun `un portrait avec image affiche l image et non le degrade`() {
        val bitmap = render(listOf(portrait("a", image = solid(Color.GREEN)), portrait("b", image = solid(Color.GREEN))))
        val box = boxes(2).first()
        val pixel = bitmap.getPixel(box.rect.midX.toInt(), box.rect.midY.toInt())
        assertThat(Color.green(pixel)).isGreaterThan(200)
        assertThat(Color.red(pixel)).isLessThan(60)
    }

    @Test
    fun `une image recyclee est traitee comme absente et ne plante pas`() {
        val dead = solid(Color.RED).also { it.recycle() }
        val gone = portrait("a", image = dead)
        assertThat(gone.hasImage).isFalse()
        val bitmap = render(listOf(gone, portrait("b")))
        val box = boxes(2).first()
        val pixel = bitmap.getPixel(box.rect.minX.toInt() + 6, box.rect.minY.toInt() + 6)
        assertThat(channelDistance(pixel, BACKGROUND_PIXEL)).isGreaterThan(20)
    }

    @Test
    fun `un portrait garde son identite pour les textes du cadre`() {
        val person = CallFramePortrait("id", "Nom", "pseudo", true, null).person
        assertThat(person.handle).isEqualTo("pseudo")
        assertThat(person.isSelf).isTrue()
    }
}
