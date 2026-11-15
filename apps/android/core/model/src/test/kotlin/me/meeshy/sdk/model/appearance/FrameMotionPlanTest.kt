package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class FrameMotionPlanTest {

    private val vectors: JsonArray = checkNotNull(javaClass.getResourceAsStream(RESOURCE)) { "vecteurs absents" }
        .bufferedReader().use { Json.parseToJsonElement(it.readText()).jsonArray }

    private fun doubles(array: JsonArray) = array.map { it.jsonPrimitive.double }

    private fun point(array: JsonArray) = doubles(array).let { FramePoint(it[0], it[1]) }

    private fun planOf(vector: JsonObject): FrameMotionPlan {
        val elements = vector.getValue("elements").jsonArray.map { element ->
            val node = element.jsonObject
            val bounds = (node["bounds"] as? JsonArray)?.let { doubles(it) }
                ?.let { FrameBounds(it[0], it[1], it[2], it[3]) }
            FrameMotionElement(node["group"]?.jsonPrimitive?.content, bounds)
        }
        val motions = vector.getValue("motions").jsonArray.map {
            Json.decodeFromJsonElement(FrameMotion.serializer(), it)
        }
        return FrameMotionPlan.make(elements, motions, point(vector.getValue("center").jsonArray))
    }

    private fun stepOf(node: JsonObject) = FrameMotionStep(
        kind = FrameStepKind.valueOf(node.getValue("kind").jsonPrimitive.content),
        duration = node.getValue("duration").jsonPrimitive.double,
        delay = node.getValue("delay").jsonPrimitive.double,
        direction = FrameStepDirection.valueOf(node.getValue("direction").jsonPrimitive.content),
        from = node.getValue("from").jsonPrimitive.double,
        to = node.getValue("to").jsonPrimitive.double,
        linear = node.getValue("linear").jsonPrimitive.boolean,
        origin = point(node.getValue("origin").jsonArray),
    )

    private fun ints(array: JsonArray) = array.map { it.jsonPrimitive.int }

    @Test
    fun `chaque vecteur partage produit le plan du TypeScript`() {
        assertThat(vectors).isNotEmpty()
        vectors.map { it.jsonObject }.forEach { vector ->
            val label = vector.getValue("_label").jsonPrimitive.content
            val plan = planOf(vector)
            val layers = vector.getValue("layers").jsonArray.map { it.jsonObject }.map { layer ->
                FrameMotionLayerPlan(
                    ints(layer.getValue("elements").jsonArray),
                    layer.getValue("chain").jsonArray.map { stepOf(it.jsonObject) },
                )
            }
            val sweeps = vector.getValue("sweeps").jsonArray.map { it.jsonObject }.map { sweep ->
                FrameSweepPlan(
                    ints(sweep.getValue("elements").jsonArray),
                    sweep.getValue("duration").jsonPrimitive.double,
                    sweep.getValue("delay").jsonPrimitive.double,
                    sweep.getValue("reverse").jsonPrimitive.boolean,
                )
            }
            assertWithMessage("$label / couches").that(plan.layers).isEqualTo(layers)
            assertWithMessage("$label / reflets").that(plan.sweeps).isEqualTo(sweeps)
            assertWithMessage("$label / animes").that(plan.animated)
                .isEqualTo(ints(vector.getValue("animated").jsonArray).toSet())
        }
    }

    @Test
    fun `sans mouvement le plan est immobile`() {
        val plan = FrameMotionPlan.make(listOf(FrameMotionElement("a", null)), emptyList(), FramePoint(0.0, 0.0))
        assertThat(plan).isEqualTo(FrameMotionPlan.STILL)
        assertThat(plan.isStill).isTrue()
    }

    @Test
    fun `un reflet seul n'est pas immobile mais ne retire rien du dessin fixe`() {
        val plan = FrameMotionPlan.make(
            listOf(FrameMotionElement("a", null)),
            listOf(FrameMotion(FrameMotionKind.SWEEP, listOf("a"), duration = 3.0)),
            FramePoint(0.0, 0.0),
        )
        assertThat(plan.isStill).isFalse()
        assertThat(plan.animated).isEmpty()
    }

    private companion object {
        const val RESOURCE = "/me/meeshy/sdk/model/appearance/frame-motion-plan-vectors.json"
    }
}
