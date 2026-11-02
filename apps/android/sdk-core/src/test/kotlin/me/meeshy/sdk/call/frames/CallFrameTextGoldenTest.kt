package me.meeshy.sdk.call.frames

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.call.frames.CallFrameBrand
import me.meeshy.sdk.model.call.frames.CallFrameBrandMark
import me.meeshy.sdk.model.call.frames.CallFrameBrandPlace
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameFont
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameLook
import me.meeshy.sdk.model.call.frames.CallFrameNameShow
import me.meeshy.sdk.model.call.frames.CallFrameNameStyle
import me.meeshy.sdk.model.call.frames.CallFrameNames
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentKind
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentMotion
import me.meeshy.sdk.model.call.frames.CallFrameRect
import me.meeshy.sdk.model.call.frames.CallFrameTextEffect
import me.meeshy.sdk.model.call.frames.CallFrameTextPlanner
import me.meeshy.sdk.model.call.frames.CallFrameTextSize
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallFrameTitle
import me.meeshy.sdk.model.call.frames.CallFrameTitlePlace
import me.meeshy.sdk.model.call.frames.CallFrameTitleSource
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameTextGoldenTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private val group = CallFrameTexts(groupName = "Les cousins", isGroup = true, date = "29 oct. 2026", accentHex = null)

    private fun title(
        source: CallFrameTitleSource = CallFrameTitleSource.GROUP,
        place: CallFrameTitlePlace = CallFrameTitlePlace.TOP,
        effect: CallFrameTextEffect? = null,
    ) = CallFrameTitle(source, CallFrameFont.CLASSIC, "#FFFFFF", place, CallFrameTextSize.L, effect, null)

    private fun design(
        title: CallFrameTitle = title(CallFrameTitleSource.NONE),
        names: CallFrameNames = CallFrameNames(CallFrameNameShow.NONE, CallFrameNameStyle.CAPTION, CallFrameFont.BOLD, "#FFFFFF", null),
        brand: CallFrameBrand? = null,
    ): CallFrameDesign {
        val base = testFrame()
        val look = base.look.copy(layout = base.look.layout.copy(top = 0.12, bottom = 0.14), title = title, names = names, brand = brand)
        return base.copy(id = "test.text.${look.hashCode()}", look = look)
    }

    private fun CallFrameDesign.with(look: CallFrameLook) = copy(id = "test.text.${look.hashCode()}", look = look)

    private fun render(frame: CallFrameDesign, texts: CallFrameTexts = group, width: Int = 216, height: Int = 384): Bitmap {
        val faces = listOf(portrait("p1", "Awa", solid(Color.RED)), portrait("p2", "Karim", solid(Color.RED)))
        return requireNotNull(CallFrameRenderer.render(frame, faces, texts, width, height)) { "rendu nul" }
    }

    private fun crop(bitmap: Bitmap, rect: CallFrameRect): Bitmap =
        Bitmap.createBitmap(bitmap, rect.minX.toInt(), rect.minY.toInt(), rect.width.toInt(), rect.height.toInt())

    private fun stage(frame: CallFrameDesign, texts: CallFrameTexts = group) =
        CallFrameStage(frame, listOf(portrait("p1", "Awa").person, portrait("p2", "Karim").person), texts, 216, 384)

    private fun names(style: CallFrameNameStyle, show: CallFrameNameShow = CallFrameNameShow.NAME) =
        CallFrameNames(show, style, CallFrameFont.BOLD, "#FFFFFF", null)

    private fun brand(place: CallFrameBrandPlace, mark: CallFrameBrandMark = CallFrameBrandMark.BOTH) =
        CallFrameBrand(mark, place, "#FFFFFF", CallFrameTextSize.L, null)

    @Test
    fun `le titre s ecrit dans la reserve haute sans toucher aux visages`() {
        val bare = render(design())
        val titled = render(design(title()))
        val st = stage(design(title()))
        assertThat(changedPixels(crop(bare, st.areas.top), crop(titled, st.areas.top))).isGreaterThan(20)
        val face = st.boxes.first().rect
        val inner = CallFrameRect(face.minX + 2, face.minY + 2, face.width - 4, face.height - 4)
        assertThat(changedPixels(crop(bare, inner), crop(titled, inner))).isEqualTo(0)
    }

    @Test
    fun `le nom du groupe et la date ne s ecrivent pas pareil`() {
        val groupTitle = render(design(title()))
        val dateTitle = render(design(title(CallFrameTitleSource.DATE)))
        assertThat(changedPixels(groupTitle, dateTitle)).isGreaterThan(0)
    }

    @Test
    fun `un nom arabe s ecrit, et un titre trop long reste dans sa rangee`() {
        val arabic = CallFrameTexts(groupName = "عائلة الكبيرة في المساء", isGroup = true, date = "", accentHex = null)
        val long = CallFrameTexts(groupName = "Le grand conseil de famille élargie du dimanche soir et du lundi", isGroup = true, date = "", accentHex = null)
        val bare = render(design())
        assertThat(changedPixels(bare, render(design(title()), arabic))).isGreaterThan(20)
        val st = stage(design(title()), long)
        val row = requireNotNull(CallFrameTextPlanner.plan(st.textScene, CallFrameFontBook()).title)
        val written = render(design(title()), long)
        val leftEdge = CallFrameRect(0.0, row.minY, row.minX + st.unit * 0.005, row.height)
        assertThat(changedPixels(crop(bare, leftEdge), crop(written, leftEdge))).isEqualTo(0)
    }

    @Test
    fun `chaque effet de titre se voit`() {
        val plain = render(design(title(effect = CallFrameTextEffect.NONE)))
        listOf(CallFrameTextEffect.SHADOW, CallFrameTextEffect.GLOW, CallFrameTextEffect.OUTLINE).forEach { effect ->
            assertWithMessage(effect.raw).that(changedPixels(plain, render(design(title(effect = effect))))).isGreaterThan(0)
        }
    }

    @Test
    fun `chacun des styles de noms s ecrit`() {
        val bare = render(design())
        CallFrameNameStyle.entries.forEach { style ->
            assertWithMessage(style.raw).that(changedPixels(bare, render(design(names = names(style))))).isGreaterThan(10)
        }
    }

    @Test
    fun `une banderole se pose sous la case quand la geometrie lui a laisse la place`() {
        val frame = design(names = names(CallFrameNameStyle.RIBBON))
        val st = stage(frame)
        val withNames = render(frame)
        val withoutNames = render(design())
        val face = st.boxes.first().rect
        val inner = CallFrameRect(face.minX + 2, face.minY + 2, face.width - 4, face.height - 4)
        val faces = listOf(portrait("p1", "Awa", solid(Color.RED)), portrait("p2", "Karim", solid(Color.RED)))
        val sameGeometry = requireNotNull(
            CallFrameRenderer.render(frame, faces, group, 216, 384, extras = CallFrameExtraPainter.None),
        )
        assertThat(changedPixels(crop(sameGeometry, inner), crop(withNames, inner))).isEqualTo(0)
        assertThat(changedPixels(withoutNames, withNames)).isGreaterThan(10)
    }

    @Test
    fun `chaque signature laisse sa trace, et le filigrane couvre la toile`() {
        val bare = render(design())
        CallFrameBrandPlace.entries.forEach { place ->
            assertWithMessage(place.raw).that(changedPixels(bare, render(design(brand = brand(place))))).isGreaterThan(10)
        }
        CallFrameBrandMark.entries.forEach { mark ->
            assertWithMessage(mark.raw).that(changedPixels(bare, render(design(brand = brand(CallFrameBrandPlace.BOTTOM, mark))))).isGreaterThan(10)
        }
        val watermark = render(design(brand = brand(CallFrameBrandPlace.WATERMARK)))
        val st = stage(design())
        val face = st.boxes.first().rect
        val inner = CallFrameRect(face.minX + 2, face.minY + 2, face.width - 4, face.height - 4)
        assertThat(changedPixels(crop(bare, inner), crop(watermark, inner), threshold = 2)).isGreaterThan(0)
    }

    @Test
    fun `une vignette et une capture ecrivent le meme titre`() {
        val frame = design(title(), names(CallFrameNameStyle.CAPTION), brand(CallFrameBrandPlace.BOTTOM))
        val small = render(frame, width = 108, height = 192)
        val large = Bitmap.createScaledBitmap(render(frame, width = 1080, height = 1920), 108, 192, true)
        assertThat(meanDifference(small, large)).isLessThan(0.06)
    }

    @Test
    fun `les textes se cuisent dans le dessus du cadre en direct, et le masque des ornements anime les evite`() {
        val snow = ornament(CallFrameOrnamentKind.SNOW, layer = CallFrameLayer.FRONT, motion = CallFrameOrnamentMotion.LOOP)
        val base = design(title())
        val frame = base.with(base.look.copy(ornaments = listOf(snow)))
        val st = stage(frame)
        val scene = requireNotNull(CallFrameLivePainter.paint(st, animates = true))
        val headline = requireNotNull(CallFrameRendererText.layout(st).headline)
        val inked = (headline.minX.toInt() until headline.maxX.toInt()).count { x ->
            Color.alpha(scene.overlay.getPixel(x, headline.midY.toInt())) > 0
        }
        assertThat(inked).isGreaterThan(0)
        val mask = requireNotNull(scene.motion).mask
        assertThat(Color.alpha(mask.getPixel((headline.midX / 2).toInt(), (headline.midY / 2).toInt()))).isEqualTo(0)
    }

    @Test
    fun `la cle des couches ne change pas d une image a l autre pour un cadre immobile`() {
        val frame = design(title(), brand = brand(CallFrameBrandPlace.TOP))
        val a = CallFrameFramePainter(frame.look.ornaments, elapsed = 1.0)
        val b = CallFrameFramePainter(frame.look.ornaments, elapsed = 9.0)
        assertThat(a.cacheKey).isEqualTo(b.cacheKey)
    }
}
