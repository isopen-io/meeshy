package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlin.math.PI
import org.junit.Test

class AvatarRingGeometryTest {

    private fun ring(style: String, width: Double = 0.04, colors: String = """["#FF0000","#0000FF"]"""): AvatarRingDesign =
        Json.decodeFromString(
            AvatarRingDesign.serializer(),
            """{"key":"r","stroke":{"style":"$style","width":$width,"colors":$colors}}""",
        )

    @Test
    fun `solid draws one circle sitting on the edge of the box`() {
        val layers = AvatarRingGeometry.strokeLayers(ring("solid"))
        assertThat(layers).containsExactly(RingStrokeLayer.Circle(radius = 48.0, width = 4.0, colorHex = "#FF0000"))
    }

    @Test
    fun `stroke width is relative to the hundred unit box`() {
        val layer = AvatarRingGeometry.strokeLayers(ring("solid", width = 0.1)).single() as RingStrokeLayer.Circle
        assertThat(layer.width).isWithin(1e-9).of(10.0)
        assertThat(layer.radius).isWithin(1e-9).of(45.0)
    }

    @Test
    fun `double adds an inner circle in the second colour two widths inside`() {
        val layers = AvatarRingGeometry.strokeLayers(ring("double"))
        assertThat(layers).hasSize(2)
        val inner = layers[1] as RingStrokeLayer.Circle
        assertThat(inner.radius).isWithin(1e-9).of(48.0 - 8.0)
        assertThat(inner.colorHex).isEqualTo("#0000FF")
    }

    @Test
    fun `double with a single colour reuses the first`() {
        val layers = AvatarRingGeometry.strokeLayers(ring("double", colors = """["#123456"]"""))
        assertThat((layers[1] as RingStrokeLayer.Circle).colorHex).isEqualTo("#123456")
    }

    @Test
    fun `dotted has twenty eight evenly spaced dots`() {
        val dots = AvatarRingGeometry.strokeLayers(ring("dotted")).single() as RingStrokeLayer.Dots
        assertThat(dots.count).isEqualTo(28)
        assertThat(dots.pitch * 28).isWithin(1e-9).of(2 * PI * dots.radius)
    }

    @Test
    fun `dashed has thirty six dashes filling sixty percent of each step`() {
        val dashes = AvatarRingGeometry.strokeLayers(ring("dashed")).single() as RingStrokeLayer.Dashes
        assertThat(dashes.count).isEqualTo(36)
        assertThat(dashes.dash / (dashes.dash + dashes.gap)).isWithin(1e-9).of(0.6)
        assertThat((dashes.dash + dashes.gap) * 36).isWithin(1e-9).of(2 * PI * dashes.radius)
    }

    @Test
    fun `gradient sweeps twenty four overlapping arcs from the top and loops back to the first colour`() {
        val sweep = AvatarRingGeometry.strokeLayers(ring("gradient")).single() as RingStrokeLayer.Sweep
        assertThat(sweep.arcs).hasSize(24)
        assertThat(sweep.arcs.first().startRadians).isWithin(1e-9).of(-PI / 2)
        assertThat(sweep.arcs.first().colorHex).isEqualTo("#FF0000")
        assertThat(sweep.arcs[1].startRadians).isLessThan(sweep.arcs[0].endRadians)
        assertThat(sweep.arcs.last().colorHex).isNotEqualTo("#FF0000")
    }

    @Test
    fun `none draws no base stroke`() {
        assertThat(AvatarRingGeometry.strokeLayers(ring("none"))).isEmpty()
    }

    @Test
    fun `cyclic colour is the first colour at the start and halfway between pairs`() {
        val colors = listOf("#000000", "#FFFFFF")
        assertThat(AvatarRingGeometry.cyclicHex(colors, 0.0)).isEqualTo("#000000")
        assertThat(AvatarRingGeometry.cyclicHex(colors, 0.5)).isEqualTo("#FFFFFF")
        assertThat(AvatarRingGeometry.cyclicHex(colors, 0.25)).isEqualTo("#808080")
    }

    @Test
    fun `lerp is bounded for short and long hex and reads garbage as black`() {
        assertThat(AvatarRingGeometry.lerpHex("#F00", "#FF0000FF", 0.0)).isEqualTo("#FF0000")
        assertThat(AvatarRingGeometry.lerpHex("zz", "#FFFFFF", 0.0)).isEqualTo("#000000")
    }

    @Test
    fun `the avatar shrinks to the ring hole so the story ring stays visible and concentric`() {
        assertThat(AvatarRingGeometry.avatarScale(40.0, null)).isEqualTo(1.0)
        assertThat(AvatarRingGeometry.avatarScale(40.0, 46.0)).isWithin(1e-9).of(40.0 / 46.0)
        assertThat(AvatarRingGeometry.avatarScale(40.0, 30.0)).isEqualTo(1.0)
        assertThat(AvatarRingGeometry.footprintScale(40.0, null)).isEqualTo(0.84)
        assertThat(AvatarRingGeometry.footprintScale(40.0, 46.0)).isWithin(1e-9).of(0.84 * 40.0 / 46.0)
    }

    @Test
    fun `the ring frame is a hundredth over the hole around the avatar`() {
        assertThat(AvatarRingGeometry.frameSide(84.0)).isWithin(1e-9).of(100.0)
    }

    @Test
    fun `every ring of the embedded catalog yields drawable layers`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())
        val rings = catalog.ringPacks.flatMap { it.rings }
        assertThat(rings).isNotEmpty()
        rings.forEach { design ->
            val layers = AvatarRingGeometry.strokeLayers(design)
            if (design.stroke.style != RingStrokeStyle.NONE) assertThat(layers).isNotEmpty()
            design.ornamentPaths.forEach { path -> assertThat(SvgPathData.parse(path.d)).isNotEmpty() }
        }
    }
}
