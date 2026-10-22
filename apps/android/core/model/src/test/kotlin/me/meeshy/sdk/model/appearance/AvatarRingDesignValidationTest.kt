package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.appearance.AppearanceFixtures.array
import me.meeshy.sdk.model.appearance.AppearanceFixtures.frameGradient
import me.meeshy.sdk.model.appearance.AppearanceFixtures.motionJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.number
import me.meeshy.sdk.model.appearance.AppearanceFixtures.parse
import me.meeshy.sdk.model.appearance.AppearanceFixtures.ringJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.ringWithOrnamentJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.text
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Test

/** Un contour se voit des AUTRES : illisible, il est refusé EN BLOC, jamais dessiné de travers. */
class AvatarRingDesignValidationTest {

    /** Le contour tel que la liste d'un pack le lit : `null` = refusé, et ses voisins restent. */
    private fun read(ring: JsonObject, neighbour: JsonObject = ringJson("voisin")): AvatarRingDesign? {
        val pack = parse("""{"slug":"contours","rings":[]}""").with("rings" to array(ring, neighbour))
        val rings = AppearanceFixtures.json.decodeFromString(AvatarRingPack.serializer(), pack.toString()).rings
        assertThat(rings.map { it.key }).contains("voisin")
        return rings.firstOrNull { it.key == ring["key"]!!.jsonPrimitive.content }
    }

    private fun colors(vararg hex: String): JsonElement =
        parse("""{"style":"solid","width":0.03,"colors":[${hex.joinToString(",") { "\"$it\"" }}]}""")

    // --- Les couleurs ---------------------------------------------------------

    @Test
    fun `a ring with well formed colours is read`() {
        val read = read(ringJson("ok").with("stroke" to colors("#C9A86A", "#6366F1")))

        assertThat(read).isNotNull()
        assertThat(read!!.stroke.colors).containsExactly("#C9A86A", "#6366F1").inOrder()
    }

    @Test
    fun `a ring whose colour is not hexadecimal is refused as a whole`() {
        assertThat(read(ringJson("sale").with("stroke" to colors("#C9A86A", "rouge")))).isNull()
    }

    @Test
    fun `the short, long and alpha hexadecimal forms are accepted with or without the hash`() {
        listOf("#abc", "#C9A86A", "#C9A86A80", "C9A86A", "abc").forEach { hex ->
            assertThat(AvatarRingStroke.isWellFormedHex(hex)).isTrue()
        }
    }

    @Test
    fun `anything else is not a drawable colour`() {
        listOf("", "#", "#12", "#12345", "#1234567", "#GGGGGG", "#12 456", "red", "#C9A86A;", "##C9A86A").forEach { hex ->
            assertThat(AvatarRingStroke.isWellFormedHex(hex)).isFalse()
        }
    }

    @Test
    fun `a ring has between one and eight colours`() {
        val eight = Array(8) { "#C9A86A" }
        val nine = Array(9) { "#C9A86A" }

        assertThat(read(ringJson("huit").with("stroke" to colors(*eight)))).isNotNull()
        assertThat(read(ringJson("neuf").with("stroke" to colors(*nine)))).isNull()
        assertThat(read(ringJson("zero").with("stroke" to colors()))).isNull()
    }

    @Test
    fun `a stroke width outside the contract is refused`() {
        val wide = parse("""{"style":"solid","width":0.5,"colors":["#C9A86A"]}""")
        val hair = parse("""{"style":"solid","width":0.001,"colors":["#C9A86A"]}""")

        assertThat(read(ringJson("large").with("stroke" to wide))).isNull()
        assertThat(read(ringJson("fin").with("stroke" to hair))).isNull()
    }

    @Test
    fun `a stroke style from a newer gateway refuses that ring alone`() {
        val future = parse("""{"style":"neon","width":0.03,"colors":["#C9A86A"]}""")

        assertThat(read(ringJson("futur").with("stroke" to future))).isNull()
    }

    // --- L'index de couleur des traits d'ornement -----------------------------

    @Test
    fun `an ornament stroke pointing at an existing colour is read`() {
        val read = read(ringWithOrnamentJson("deco", color = 1))

        assertThat(read!!.ornamentPaths).hasSize(1)
        assertThat(read.ornamentPaths.single().color).isEqualTo(1)
    }

    @Test
    fun `an ornament stroke pointing at a colour the ring does not have refuses the ring as a whole`() {
        assertThat(read(ringWithOrnamentJson("deco", color = 2))).isNull()
    }

    @Test
    fun `a negative colour index refuses the ring`() {
        assertThat(read(ringWithOrnamentJson("deco", color = -1))).isNull()
    }

    @Test
    fun `a ring with no ornament has no ornament strokes`() {
        assertThat(read(ringJson("filet"))!!.ornamentPaths).isEmpty()
    }

    @Test
    fun `the none style draws no base stroke and lets the ornament draw everything`() {
        val none = ringWithOrnamentJson("orne").with(
            "stroke" to parse("""{"style":"none","width":0.03,"colors":["#C9A86A","#6366F1"]}"""),
        )

        assertThat(read(none)!!.stroke.style).isEqualTo(RingStrokeStyle.NONE)
    }

    @Test
    fun `an ornament path with a non SVG command is refused`() {
        val injected = ringJson("inj").with(
            "ornament" to parse("""{"paths":[{"d":"<script>alert(1)</script>","color":0,"opacity":1}]}"""),
        )

        assertThat(read(injected)).isNull()
    }

    @Test
    fun `an ornament opacity outside zero to one is refused`() {
        val opaque = ringJson("opaque").with(
            "ornament" to parse("""{"paths":[{"d":"M0 0L1 1","color":0,"opacity":1.5}]}"""),
        )

        assertThat(read(opaque)).isNull()
    }

    @Test
    fun `an ornament path group must be a slug`() {
        val badGroup = ringJson("groupe").with(
            "ornament" to parse("""{"paths":[{"d":"M0 0L1 1","color":0,"opacity":1,"group":"Pas un Slug"}]}"""),
        )

        assertThat(read(badGroup)).isNull()
    }

    @Test
    fun `a ring key must be a slug`() {
        assertThat(read(ringJson("Pas Un Slug"))).isNull()
    }

    // --- Les dégradés gardent leur place ----------------------------------------

    @Test
    fun `an unreadable gradient keeps its place so the stroke index stays right`() {
        val unknownKind = parse("""{"kind":"radial","x1":0,"y1":0,"x2":1,"y2":0,"stops":[{"color":0,"at":0},{"color":1,"at":1}]}""")
        val ring = ringJson("dege").with(
            "gradients" to array(unknownKind, frameGradient(0, 1)),
            "ornament" to parse("""{"paths":[{"d":"M0 0L1 1","color":0,"opacity":1,"gradient":1}]}"""),
        )

        val read = read(ring)!!

        assertThat(read.gradients).hasSize(2)
        assertThat(read.gradients[0]).isNull()
        assertThat(read.gradients[1]).isNotNull()
        assertThat(read.ornamentPaths.single().gradient).isEqualTo(1)
    }

    @Test
    fun `a gradient pointing at a colour the ring does not have refuses the ring`() {
        val ring = ringJson("dege").with("gradients" to array(frameGradient(0, 5)))

        assertThat(read(ring)).isNull()
    }

    @Test
    fun `a stroke pointing at an undeclared gradient refuses the ring`() {
        val ring = ringJson("dege").with(
            "ornament" to parse("""{"paths":[{"d":"M0 0L1 1","color":0,"opacity":1,"gradient":0}]}"""),
        )

        assertThat(read(ring)).isNull()
    }

    @Test
    fun `at most four gradients are kept`() {
        val six = JsonArray(List(6) { frameGradient(0, 1) })

        assertThat(read(ringJson("dege").with("gradients" to six))!!.gradients).hasSize(4)
    }

    // --- Mouvements et couche animée : tolérants, jamais le contour ------------

    @Test
    fun `an unknown motion is ignored and the ring and its other motions stay`() {
        val ring = ringWithOrnamentJson("anime").with(
            "motion" to array(motionJson("rotate"), motionJson("teleport"), motionJson("pulse")),
        )

        val read = read(ring)!!

        assertThat(read.motion.map { it.kind }).containsExactly(FrameMotionKind.ROTATE, FrameMotionKind.PULSE).inOrder()
    }

    @Test
    fun `an out of bounds motion is ignored and the ring stays`() {
        val tooFast = motionJson("rotate").with("duration" to number(0.1))
        val ring = ringWithOrnamentJson("anime").with("motion" to array(tooFast, motionJson("pulse")))

        val read = read(ring)!!

        assertThat(read.motion.map { it.kind }).containsExactly(FrameMotionKind.PULSE)
    }

    @Test
    fun `an unreadable animated layer is ignored and the ring stays`() {
        val ring = ringJson("anime").with("lottie" to parse("""{"src":"x.json","bytes":1,"sha256":"y"}"""))

        assertThat(read(ring)!!.lottie).isNull()
    }

    @Test
    fun `a readable animated layer is kept`() {
        val sha = "ec52a7f12af8a193ac26a882cbd360a657da52a19d5d98a58c74a7fc1f45d902"
        val ring = ringJson("anime").with("lottie" to parse("""{"src":"ec52a7f12af8a193.json","bytes":867,"sha256":"$sha"}"""))

        assertThat(read(ring)!!.lottie!!.sha256).isEqualTo(sha)
    }

    @Test
    fun `a ring of the previous format reads without gradients nor motion`() {
        val read = read(ringJson("ancien"))!!

        assertThat(read.gradients).isEmpty()
        assertThat(read.motion).isEmpty()
        assertThat(read.lottie).isNull()
    }

    @Test
    fun `unknown fields on a ring are tolerated`() {
        val read = read(ringJson("futur").with("sparkle" to text("oui")))

        assertThat(read).isNotNull()
    }

    @Test
    fun `every ring of the embedded catalog is a valid ring`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        val rings = catalog.ringPacks.flatMap { it.rings }

        assertThat(rings).hasSize(21)
        rings.forEach { assertThat(it.stroke.colors).isNotEmpty() }
    }
}
