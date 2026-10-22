package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.appearance.AppearanceFixtures.array
import me.meeshy.sdk.model.appearance.AppearanceFixtures.frameJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.frameGradient
import me.meeshy.sdk.model.appearance.AppearanceFixtures.motionJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.number
import me.meeshy.sdk.model.appearance.AppearanceFixtures.parse
import me.meeshy.sdk.model.appearance.AppearanceFixtures.text
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Test

/**
 * Un cadre se pose SUR la photo de bannière et laisse son CENTRE transparent : hors bornes, il est
 * refusé EN BLOC — et ses voisins restent.
 */
class BannerFrameDesignBoundsTest {

    private fun read(frame: JsonObject, neighbour: JsonObject = frameJson("voisin")): BannerFrameDesign? {
        val pack = parse("""{"slug":"cadres","frames":[]}""").with("frames" to array(frame, neighbour))
        val frames = AppearanceFixtures.json.decodeFromString(BannerFramePack.serializer(), pack.toString()).frames
        assertThat(frames.map { it.key }).contains("voisin")
        return frames.firstOrNull { it.key == frame["key"]!!.jsonPrimitive.content }
    }

    private fun JsonObject.border(vararg changes: Pair<String, kotlinx.serialization.json.JsonElement?>): JsonObject =
        with("border" to (this["border"] as JsonObject).with(*changes))

    private fun JsonObject.reach(vararg changes: Pair<String, kotlinx.serialization.json.JsonElement?>): JsonObject =
        with("reach" to (this["reach"] as JsonObject).with(*changes))

    // --- Un cadre lisible ----------------------------------------------------------

    @Test
    fun `a well formed frame is read with its pieces and friezes`() {
        val read = read(frameJson("ok"))!!

        assertThat(read.palette).hasSize(3)
        assertThat(read.border.width).isEqualTo(9.6)
        assertThat(read.pieces).hasSize(1)
        assertThat(read.friezes).hasSize(1)
        assertThat(read.motion).isEmpty()
        assertThat(read.gradients).isEmpty()
    }

    @Test
    fun `a frame is drawn in the 0 0 300 100 template only`() {
        assertThat(read(frameJson("large").with("viewBox" to array(number(0), number(0), number(400), number(100))))).isNull()
        assertThat(read(frameJson("decale").with("viewBox" to array(number(5), number(0), number(300), number(100))))).isNull()
    }

    // --- Le centre transparent est une loi ----------------------------------------------

    @Test
    fun `a border wider than 9,6 would bite into the transparent centre and is refused`() {
        assertThat(read(frameJson("epais").border("width" to number(9.7)))).isNull()
        assertThat(read(frameJson("limite").border("width" to number(9.6), "filets" to array()))).isNotNull()
    }

    @Test
    fun `a border without width is refused`() {
        assertThat(read(frameJson("nul").border("width" to number(0), "filets" to array()))).isNull()
    }

    @Test
    fun `corners and cartouche may not reach past twenty`() {
        assertThat(read(frameJson("coin").reach("corner" to number(20.5)))).isNull()
        assertThat(read(frameJson("coin-ok").reach("corner" to number(20)))).isNotNull()
        val deep = parse("""{"width":18,"depth":21,"edge":"top"}""")
        assertThat(read(frameJson("profond").reach("cartouche" to deep))).isNull()
    }

    @Test
    fun `a cartouche wider than eighty is a banner, not a keystone, and is refused`() {
        val wide = parse("""{"width":81,"depth":10,"edge":"both"}""")

        assertThat(read(frameJson("bandeau").reach("cartouche" to wide))).isNull()
    }

    @Test
    fun `a filet may not start deeper than the border`() {
        val deep = parse("""{"inset":9.7,"width":0.5,"color":1,"opacity":1}""")

        assertThat(read(frameJson("filet").border("filets" to array(deep)))).isNull()
    }

    @Test
    fun `a filet may not be wider than two`() {
        val thick = parse("""{"inset":0.5,"width":2.5,"color":1,"opacity":1}""")

        assertThat(read(frameJson("filet").border("filets" to array(thick)))).isNull()
    }

    @Test
    fun `at most six filets`() {
        val filet = parse("""{"inset":0.5,"width":0.5,"color":1,"opacity":1}""")

        assertThat(read(frameJson("six").border("filets" to JsonArray(List(6) { filet })))).isNotNull()
        assertThat(read(frameJson("sept").border("filets" to JsonArray(List(7) { filet })))).isNull()
    }

    @Test
    fun `the drawable region cuts the border, the four corners and the cartouche`() {
        val region = read(frameJson("region"))!!.drawableRegion(width = 300.0)

        assertThat(region.outer).isEqualTo(FrameRect(0.0, 0.0, 300.0, 100.0))
        assertThat(region.hole).isEqualTo(FrameRect(9.6, 9.6, 280.8, 80.8))
        assertThat(region.reserved).hasSize(5)
        assertThat(region.reserved.first()).isEqualTo(FrameRect(0.0, 0.0, 14.3, 14.3))
        assertThat(region.reserved.last()).isEqualTo(FrameRect(x = (300.0 - 18.6) / 2, y = 0.0, width = 18.6, height = 11.8))
    }

    @Test
    fun `the drawable region follows the logical width of a wider banner`() {
        val region = read(frameJson("large"))!!.drawableRegion(width = 600.0)

        assertThat(region.outer.width).isEqualTo(600.0)
        assertThat(region.hole.width).isEqualTo(600.0 - 2 * 9.6)
        assertThat(region.reserved[1].x).isEqualTo(600.0 - 14.3)
    }

    @Test
    fun `a cartouche on both edges reserves two rects, one on the bottom edge only`() {
        val both = parse("""{"width":20,"depth":10,"edge":"both"}""")
        val bottom = parse("""{"width":20,"depth":10,"edge":"bottom"}""")

        val bothRegion = read(frameJson("deux").reach("cartouche" to both))!!.drawableRegion(300.0)
        val bottomRegion = read(frameJson("bas").reach("cartouche" to bottom))!!.drawableRegion(300.0)

        assertThat(bothRegion.reserved).hasSize(6)
        assertThat(bottomRegion.reserved).hasSize(5)
        assertThat(bottomRegion.reserved.last().y).isEqualTo(90.0)
    }

    @Test
    fun `a frame without cartouche reserves only its corners`() {
        val region = read(frameJson("sans").reach("cartouche" to null))!!.drawableRegion(300.0)

        assertThat(region.reserved).hasSize(4)
    }

    // --- La palette et les index --------------------------------------------------------

    @Test
    fun `a palette colour that is not hexadecimal refuses the frame`() {
        assertThat(read(frameJson("sale").with("palette" to array(text("#DCD2C0"), text("pas un hex"))))).isNull()
    }

    @Test
    fun `a palette has between one and eight colours`() {
        assertThat(read(frameJson("vide").with("palette" to array()))).isNull()
        assertThat(read(frameJson("neuf").with("palette" to JsonArray(List(9) { text("#DCD2C0") })))).isNull()
    }

    @Test
    fun `a stroke pointing at a colour outside the palette would crash the drawing and is refused`() {
        assertThat(read(frameJson("hors").border("color" to number(3)))).isNull()
        val outside = parse("""{"d":"M0 0H14","color":9,"opacity":1}""")
        val piece = parse("""{"anchor":"start","paths":[$outside]}""")
        assertThat(read(frameJson("piece").with("pieces" to array(piece)))).isNull()
    }

    @Test
    fun `a stroke pointing at a gradient that was never declared is refused`() {
        assertThat(read(frameJson("sans-degrade").border("gradient" to number(0)))).isNull()
    }

    @Test
    fun `a declared but unreadable gradient keeps its place and the stroke falls back on its colour`() {
        val unknown = parse("""{"kind":"conic","x1":0,"y1":0,"x2":1,"y2":0,"stops":[]}""")
        val read = read(frameJson("degrade").with("gradients" to array(unknown)).border("gradient" to number(0)))!!

        assertThat(read.gradients).hasSize(1)
        assertThat(read.gradients.single()).isNull()
        assertThat(read.border.gradient).isEqualTo(0)
    }

    @Test
    fun `a readable gradient is kept`() {
        val read = read(frameJson("degrade").with("gradients" to array(frameGradient(0, 2))).border("gradient" to number(0)))!!

        assertThat(read.gradients.single()!!.stops.map { it.color }).containsExactly(0, 2).inOrder()
    }

    @Test
    fun `a gradient pointing at a colour outside the palette refuses the frame`() {
        assertThat(read(frameJson("degrade").with("gradients" to array(frameGradient(0, 7))))).isNull()
    }

    // --- Pièces, frises et chemins ------------------------------------------------------

    @Test
    fun `a frieze with a null module would loop the renderer and is refused`() {
        val frieze = parse("""{"module":0,"from":0,"to":0,"fit":"repeat","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")

        assertThat(read(frameJson("boucle").with("friezes" to array(frieze)))).isNull()
    }

    @Test
    fun `a frieze must fit between its margins`() {
        val overflow = parse("""{"module":60,"from":150,"to":100,"fit":"repeat","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")
        val exact = parse("""{"module":60,"from":150,"to":90,"fit":"repeat","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")

        assertThat(read(frameJson("deborde").with("friezes" to array(overflow)))).isNull()
        assertThat(read(frameJson("juste").with("friezes" to array(exact)))).isNotNull()
    }

    @Test
    fun `a frieze module may not exceed sixty`() {
        val big = parse("""{"module":61,"from":0,"to":0,"fit":"justify","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")

        assertThat(read(frameJson("module").with("friezes" to array(big)))).isNull()
    }

    @Test
    fun `a piece or a frieze without paths is refused`() {
        assertThat(read(frameJson("piece").with("pieces" to array(parse("""{"anchor":"end","paths":[]}"""))))).isNull()
    }

    @Test
    fun `at most sixteen pieces and eight friezes`() {
        val piece = parse("""{"anchor":"start","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")
        val frieze = parse("""{"module":10,"from":0,"to":0,"fit":"repeat","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")

        assertThat(read(frameJson("seize").with("pieces" to JsonArray(List(16) { piece }), "friezes" to array()))).isNotNull()
        assertThat(read(frameJson("dix-sept").with("pieces" to JsonArray(List(17) { piece }), "friezes" to array()))).isNull()
        assertThat(read(frameJson("neuf-frises").with("pieces" to array(), "friezes" to JsonArray(List(9) { frieze })))).isNull()
    }

    @Test
    fun `at most forty eight paths in all`() {
        val path = parse("""{"d":"M0 0H1","color":0,"opacity":1}""")
        fun piece(count: Int) = parse("""{"anchor":"start","paths":[]}""").with("paths" to JsonArray(List(count) { path }))

        assertThat(read(frameJson("limite").with("pieces" to array(piece(48)), "friezes" to array()))).isNotNull()
        assertThat(read(frameJson("trop").with("pieces" to array(piece(49)), "friezes" to array()))).isNull()
    }

    @Test
    fun `a path with anything but SVG commands is refused`() {
        val injected = parse("""{"d":"M0 0 <script/>","color":0,"opacity":1}""")
        val piece = parse("""{"anchor":"start","paths":[$injected]}""")

        assertThat(read(frameJson("inj").with("pieces" to array(piece)))).isNull()
    }

    @Test
    fun `a path longer than four thousand characters is refused`() {
        val long = "M0 0" + "L1 1".repeat(1100)
        val path = parse("""{"d":"$long","color":0,"opacity":1}""")
        val piece = parse("""{"anchor":"start","paths":[$path]}""")

        assertThat(read(frameJson("long").with("pieces" to array(piece), "friezes" to array()))).isNull()
    }

    @Test
    fun `a path opacity outside zero to one is refused`() {
        val path = parse("""{"d":"M0 0H1","color":0,"opacity":2}""")
        val piece = parse("""{"anchor":"start","paths":[$path]}""")

        assertThat(read(frameJson("opaque").with("pieces" to array(piece)))).isNull()
    }

    @Test
    fun `a stroke width must be positive and at most forty`() {
        fun withWidth(width: Number): JsonObject {
            val path = parse("""{"d":"M0 0H1","color":0,"opacity":1}""").with("width" to number(width))
            return frameJson("trait").with("pieces" to array(parse("""{"anchor":"start","paths":[]}""").with("paths" to array(path))))
        }

        assertThat(read(withWidth(0))).isNull()
        assertThat(read(withWidth(41))).isNull()
        assertThat(read(withWidth(40))).isNotNull()
    }

    @Test
    fun `a frame key must be a slug`() {
        assertThat(read(frameJson("Pas Un Slug"))).isNull()
    }

    @Test
    fun `an anchor from a newer gateway refuses that frame alone`() {
        val piece = parse("""{"anchor":"diagonal","paths":[{"d":"M0 0H1","color":0,"opacity":1}]}""")

        assertThat(read(frameJson("futur").with("pieces" to array(piece)))).isNull()
    }

    // --- Mouvements et couche animée : tolérants -----------------------------------------

    @Test
    fun `the motions of a frame are read, the unknown and out of bounds ones are ignored`() {
        val sweep = motionJson("sweep", "coin")
        val bad = motionJson("rotate", "coin").with("amplitude" to number(400))
        val unknown = motionJson("explode", "coin")

        val read = read(frameJson("anime").with("motion" to array(sweep, bad, unknown)))!!

        assertThat(read.motion.map { it.kind }).containsExactly(FrameMotionKind.SWEEP)
    }

    @Test
    fun `an unreadable animated layer is ignored and the frame stays`() {
        val read = read(frameJson("anime").with("lottie" to text("pas un objet")))!!

        assertThat(read.lottie).isNull()
    }

    @Test
    fun `every frame of the embedded catalog is valid and keeps its transparent centre`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        val frames = catalog.bannerFramePacks.flatMap { it.frames }

        assertThat(frames).hasSize(14)
        frames.forEach { frame ->
            val region = frame.drawableRegion(BannerFrameDesign.REFERENCE_WIDTH)
            assertThat(region.hole.width).isGreaterThan(0.0)
            assertThat(frame.border.width).isAtMost(BannerFrameDesign.MAX_BORDER_WIDTH)
        }
    }
}
