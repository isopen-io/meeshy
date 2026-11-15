package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameSceneArt
import me.meeshy.sdk.model.call.frames.CallFrameSceneDepth
import me.meeshy.sdk.model.call.frames.CallFrameSceneLayer
import me.meeshy.sdk.model.call.frames.CallFrameSceneLayerKind
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameSceneArtRenderTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private val green = CallFrameSceneImageProviding { _, _ -> solid(Color.GREEN, 64) }

    private fun layer(
        id: String,
        kind: CallFrameSceneLayerKind,
        depth: CallFrameSceneDepth,
        src: String? = "assets/call-frames/test_$id.webp",
        slice: Double? = null,
        amount: Double? = null,
    ) = CallFrameSceneLayer(id, kind, depth, src, null, "#FFE9B0", amount, null, slice)

    private fun scened(vararg scene: CallFrameSceneLayer): CallFrameDesign {
        val base = testFrame()
        val look = base.look.copy(scene = scene.toList())
        return base.copy(id = "test.scene.${look.hashCode()}", look = look)
    }

    private fun render(frame: CallFrameDesign, images: CallFrameSceneImageProviding): Bitmap {
        val faces = listOf(portrait("p1", image = solid(Color.RED)), portrait("p2", image = solid(Color.RED)))
        return requireNotNull(
            CallFrameRenderer.render(frame, faces, testTexts(), 216, 384, extras = CallFrameFramePainter(frame.look.ornaments, images = images)),
        )
    }

    private fun faceCore(frame: CallFrameDesign): CallFrameRect {
        val box = CallFrameStage(frame, listOf(portrait("p1").person, portrait("p2").person), testTexts(), 216, 384).boxes.first().rect
        return CallFrameRect(box.midX - 10, box.midY - 10, 20.0, 20.0)
    }

    @Test
    fun `chaque illustration des declinaisons relief est embarquee dans les actifs, sous le nom que iOS lit`() {
        val assets = ApplicationProvider.getApplicationContext<android.content.Context>().assets
        val sources = CallFrameCatalogue.all.flatMap { it.styles }.flatMap { it.look.scene }
            .filter { it.kind == CallFrameSceneLayerKind.IMAGE }
            .mapNotNull { it.src }
            .toSet()
        assertThat(sources).isNotEmpty()
        sources.forEach { src ->
            val bytes = runCatching { assets.open(CallFrameSceneArt.assetPath(src)).use { it.readBytes() } }.getOrNull()
            assertWithMessage(src).that(bytes?.size ?: 0).isGreaterThan(0)
        }
    }

    @Test
    fun `la matiere se pose sur le fond, sous les visages`() {
        val frame = scened(layer("matiere", CallFrameSceneLayerKind.IMAGE, CallFrameSceneDepth.BACK))
        val painted = render(frame, green)
        assertThat(channelDistance(painted.getPixel(2, 2), Color.GREEN)).isLessThan(8)
        val core = faceCore(frame)
        assertThat(channelDistance(painted.getPixel(core.midX.toInt(), core.midY.toInt()), Color.RED)).isLessThan(8)
    }

    @Test
    fun `la moulure etiree en neuf morceaux couvre la toile au-dessus des visages, a son opacite`() {
        val frame = scened(layer("moulure", CallFrameSceneLayerKind.IMAGE, CallFrameSceneDepth.FRONT, slice = 0.18, amount = 0.5))
        val stage = CallFrameStage(frame, listOf(portrait("p1").person, portrait("p2").person), testTexts(), 216, 384)
        val overlay = requireNotNull(CallFrameRenderer.layers(stage, CallFrameFramePainter(frame.look.ornaments, images = green))).overlay
        assertThat(Color.alpha(overlay.getPixel(1, 1))).isWithin(2).of(128)
        assertThat(Color.green(overlay.getPixel(108, 192))).isGreaterThan(200)
    }

    @Test
    fun `une illustration absente ne retire que sa couche`() {
        val frame = scened(layer("matiere", CallFrameSceneLayerKind.IMAGE, CallFrameSceneDepth.BACK))
        val missing = render(frame, CallFrameSceneImageProviding.None)
        assertThat(channelDistance(missing.getPixel(2, 2), BACKGROUND_PIXEL)).isLessThan(8)
    }

    @Test
    fun `l actif embarque se decode a la taille ou il se peint`() {
        val assets = ApplicationProvider.getApplicationContext<android.content.Context>().assets
        val src = CallFrameCatalogue.all.flatMap { it.styles }.flatMap { it.look.scene }.first { it.kind == CallFrameSceneLayerKind.IMAGE }.src!!
        assertThat(CallFrameAssetImages(assets).image("assets/call-frames/absent.webp", 192)).isNull()
        val image = CallFrameAssetImages(assets).image(src, 192) ?: return
        assertThat(maxOf(image.width, image.height)).isAtLeast(192)
    }

    @Test
    fun `une lumiere de scene respire dans la couche animee, hors des visages sauf en effet`() {
        val halo = layer("halo", CallFrameSceneLayerKind.LIGHT, CallFrameSceneDepth.BACK, src = null, amount = 0.8)
        val flash = layer("flash", CallFrameSceneLayerKind.LIGHT, CallFrameSceneDepth.EFFECTS, src = null)
        val frame = scened(halo, flash)
        val stage = CallFrameStage(frame, listOf(portrait("p1").person, portrait("p2").person), testTexts(), 216, 384)
        val motion = requireNotNull(CallFrameLivePainter.paint(stage, animates = true)?.motion)
        assertThat(motion.lights.map { it.layer.id }).containsExactly("halo", "flash").inOrder()
        assertThat(motion.lights.map { it.masked }).containsExactly(true, false).inOrder()
        val image = motion.lights.first().image
        assertThat(Color.alpha(image.getPixel(image.width / 2, image.height / 2))).isGreaterThan(240)
        assertThat(Color.alpha(image.getPixel(0, 0))).isEqualTo(0)
        assertThat(CallFrameLivePainter.paint(stage, animates = false)?.motion).isNull()
    }
}
