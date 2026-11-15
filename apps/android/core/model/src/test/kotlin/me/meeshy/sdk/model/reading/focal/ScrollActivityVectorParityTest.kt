package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/** Rejoue `reading-modes/scroll-activity.vectors.json` : le contrat TS / iOS / Android de la pilule de défilement. */
class ScrollActivityVectorParityTest {

    @Test
    fun `chaque vecteur de la loi d activite de defilement est rejoue a l identique`() {
        val cases = Json.parseToJsonElement(
            SharedFixtures.file("reading-modes/scroll-activity.vectors.json").readText(),
        ).jsonArray.map { it.jsonObject }
        assertWithMessage("fichier de vecteurs vide").that(cases).isNotEmpty()
        cases.forEach { case ->
            val input = case["input"]!!.jsonObject
            val events = input["events"]!!.jsonArray.map { it.jsonObject }.map { event ->
                val at = event["at"]!!.jsonPrimitive.content.toDouble()
                when (event["type"]!!.jsonPrimitive.content) {
                    "scrolled" -> ScrollActivityEvent.Scrolled(at)
                    else -> ScrollActivityEvent.Tick(at)
                }
            }
            val state = events.fold(ScrollTimePillLaw.initialState(), ScrollTimePillLaw::reduce)
            val probeAt = input["probeAt"]!!.jsonPrimitive.content.toDouble()
            val expected = case["expected"]!!.jsonObject["visible"]!!.jsonPrimitive.content.toBoolean()
            assertWithMessage(case["_label"]!!.jsonPrimitive.content)
                .that(ScrollTimePillLaw.isVisible(state, probeAt)).isEqualTo(expected)
        }
    }
}
