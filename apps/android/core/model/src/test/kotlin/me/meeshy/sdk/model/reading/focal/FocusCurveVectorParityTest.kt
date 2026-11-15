package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.testutil.SharedFixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Rejoue `reading-modes/focus-curve.vectors.json` : le contrat TS / iOS / Android de la courbe de focus. */
class FocusCurveVectorParityTest {

    private fun cases() = Json.parseToJsonElement(
        SharedFixtures.file("reading-modes/focus-curve.vectors.json").readText(),
    ).jsonArray.map { it.jsonObject }

    @Test
    fun `chaque vecteur de la courbe de focus est rejoue a l identique`() {
        val all = cases()
        assertWithMessage("fichier de vecteurs vide").that(all).isNotEmpty()
        all.forEach { case ->
            val input = case["input"]!!.jsonObject
            val expected = case["expected"]!!.jsonObject
            val variant = when (input["variant"]!!.jsonPrimitive.content) {
                "thread" -> FocalFocusCurve.Variant.THREAD
                else -> FocalFocusCurve.Variant.LIST
            }
            val got = FocalFocusCurve.focusCurve(input["distance"]!!.jsonPrimitive.content.toDouble(), variant)
            val label = case["_label"]!!.jsonPrimitive.content
            assertWithMessage("$label alpha").that(got.alpha)
                .isWithin(1e-9).of(expected["alpha"]!!.jsonPrimitive.content.toDouble())
            assertWithMessage("$label scale").that(got.scale)
                .isWithin(1e-9).of(expected["scale"]!!.jsonPrimitive.content.toDouble())
        }
    }
}
