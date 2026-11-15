package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class CallFrameLayoutGeometryTest {

    private fun fixture(): JsonObject {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/design/call-capture-frames-layout.fixture.json")
            if (candidate.isFile) return Json.parseToJsonElement(candidate.readText()).jsonObject
            dir = dir.parentFile
        }
        error("fixture frame-layout introuvable")
    }

    private fun slotStyle(shape: String, tilt: String) = CallFrameSlotStyle(
        shape = CallFrameSlotShape.fromRaw(shape)!!, radius = null, stroke = null, double = false, glow = null,
        shadow = false, card = null, tilt = CallFrameTilt.fromRaw(tilt)!!, tone = CallFrameTone.COLOR, duotone = null,
    )

    @Test
    fun `la geometrie rend les memes rectangles que frame-layout ts sur la fixture partagee`() {
        val root = fixture()
        val params = root["params"]!!.jsonArray.associate { it.jsonObject["name"]!!.jsonPrimitive.content to it.jsonObject }
        var checked = 0
        root["cases"]!!.jsonArray.forEach { entry ->
            val case = entry.jsonObject
            val param = params.getValue(case["params"]!!.jsonPrimitive.content)
            val l = param["layout"]!!.jsonObject
            val layout = CallFrameLayout(
                arrangement = CallFrameArrangement.fromRaw(case["arrangement"]!!.jsonPrimitive.content)!!,
                margin = l["margin"]!!.jsonPrimitive.content.toDouble(),
                gap = l["gap"]!!.jsonPrimitive.content.toDouble(),
                top = l["top"]!!.jsonPrimitive.content.toDouble(),
                bottom = l["bottom"]!!.jsonPrimitive.content.toDouble(),
            )
            val s = param["slot"]!!.jsonObject
            val size = case["size"]!!.jsonArray.map { it.jsonPrimitive.content.toDouble() }
            val people = case["people"]!!.jsonPrimitive.content.toInt()

            val slots = CallFrameLayoutGeometry.slots(
                layout, slotStyle(s["shape"]!!.jsonPrimitive.content, s["tilt"]!!.jsonPrimitive.content), people, size[0], size[1],
            )

            val expected = case["slots"]!!.jsonArray
            val label = "${layout.arrangement.raw}/${case["params"]!!.jsonPrimitive.content}/$people/${size[0]}x${size[1]}"
            assertThat(slots).hasSize(expected.size)
            expected.forEachIndexed { i, slot ->
                val box = slot.jsonObject["box"]!!.jsonArray.map { it.jsonPrimitive.content.toDouble() }
                val actual = slots[i]
                assertWithin(label, "x", box[0], actual.rect.x)
                assertWithin(label, "y", box[1], actual.rect.y)
                assertWithin(label, "width", box[2], actual.rect.width)
                assertWithin(label, "height", box[3], actual.rect.height)
                assertWithin(label, "rotation", box[4], actual.rotation)
                assertThat(actual.shape.raw).isEqualTo(slot.jsonObject["shape"]!!.jsonPrimitive.content)
                checked += 1
            }
        }
        assertThat(checked).isGreaterThan(1000)
    }

    private fun assertWithin(label: String, field: String, expected: Double, actual: Double) {
        assertThat(kotlin.math.abs(expected - actual)).isLessThan(0.5)
            .also { if (kotlin.math.abs(expected - actual) >= 0.5) println("ECART $label $field attendu=$expected obtenu=$actual") }
    }

    @Test
    fun `scatter est deterministe et reste dans zero un`() {
        assertThat(CallFrameLayoutGeometry.scatter(1.0)).isEqualTo(CallFrameLayoutGeometry.scatter(1.0))
        (1..50).forEach { assertThat(CallFrameLayoutGeometry.scatter(it.toDouble())).isIn(com.google.common.collect.Range.closedOpen(0.0, 1.0)) }
    }

    @Test
    fun `split et diagonal se replient sur la grille hors duo`() {
        assertThat(CallFrameLayoutGeometry.servedArrangement(CallFrameArrangement.SPLIT, 3)).isEqualTo(CallFrameArrangement.GRID)
        assertThat(CallFrameLayoutGeometry.servedArrangement(CallFrameArrangement.DIAGONAL, 2)).isEqualTo(CallFrameArrangement.DIAGONAL)
        assertThat(CallFrameLayoutGeometry.servedArrangement(CallFrameArrangement.HERO, 5)).isEqualTo(CallFrameArrangement.HERO)
    }

    @Test
    fun `une disposition en nid d abeille force la forme hexagonale`() {
        val layout = CallFrameLayout(CallFrameArrangement.HONEYCOMB, 0.05, 0.02, 0.1, 0.1)
        val slots = CallFrameLayoutGeometry.slots(layout, slotStyle("round", "none"), 5, 1080.0, 1920.0)
        assertThat(slots.map { it.shape }.distinct()).containsExactly(CallFrameSlotShape.HEX)
    }

    @Test
    fun `zero personne ne donne aucune case`() {
        val layout = CallFrameLayout(CallFrameArrangement.GRID, 0.05, 0.02, 0.1, 0.1)
        assertThat(CallFrameLayoutGeometry.slots(layout, slotStyle("rect", "none"), 0, 1080.0, 1920.0)).isEmpty()
    }

    @Test
    fun `toutes les cases de tout le catalogue restent dans la toile`() {
        CallFrameCatalogue.all.forEach { frame ->
            val n = frame.bucket.people.last
            CallFrameLayoutGeometry.slots(frame, n, 1080.0, 1920.0).forEach {
                assertThat(it.rect.minX).isAtLeast(-1e-6)
                assertThat(it.rect.maxX).isAtMost(1080.0 + 1e-6)
                assertThat(it.rect.maxY).isAtMost(1920.0 + 1e-6)
            }
        }
    }
}
