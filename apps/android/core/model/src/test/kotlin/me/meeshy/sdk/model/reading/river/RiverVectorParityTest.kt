package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Rejoue les TROIS fichiers de vecteurs de la Rivière — le contrat TS / iOS / Android. Miroir de
 * `RiverLaneVectorTests.swift` : la rivière de deux appareils différents est la même rivière ou
 * n'est pas.
 */
class RiverVectorParityTest {

    private val lanesCases by lazy { RiverVectorFixtures.vectors(RiverVectorFixtures.LANES) }
    private val stepCases by lazy { RiverVectorFixtures.vectors(RiverVectorFixtures.STEP) }
    private val headerCases by lazy { RiverVectorFixtures.vectors(RiverVectorFixtures.HEADERS) }

    @Test
    fun `les trois fichiers chargent des cas et leurs comptes sont ceux attendus`() {
        assertWithMessage("river-lanes").that(lanesCases.size).isEqualTo(24)
        assertWithMessage("river-step").that(stepCases.size).isEqualTo(22)
        assertWithMessage("river-headers").that(headerCases.size).isEqualTo(15)
    }

    @Test
    fun `les vecteurs exercent les avis systeme, un vecteur amputé ne prouverait plus la règle`() {
        val withNotice = lanesCases.filter { case ->
            case.input.getValue("messages").jsonArray.any { it.jsonObject["isSystem"]?.jsonPrimitive?.content == "true" }
        }
        assertThat(withNotice).isNotEmpty()
        assertThat(withNotice.any { RiverVectorFixtures.geometry(it.expected!!.jsonObject).bubbles.any { b -> b.isSystem } }).isTrue()
    }

    @Test
    fun `resolveRiverLanes rejoue chaque vecteur a l identique`() {
        lanesCases.forEach { case ->
            val geometry = RiverLaneResolver.resolveRiverLanes(RiverVectorFixtures.lanesInput(case.input))
            assertWithMessage("[${case.label}] géométrie").that(geometry)
                .isEqualTo(RiverVectorFixtures.geometry(case.expected!!.jsonObject))
        }
    }

    @Test
    fun `resolveRiverStep rejoue chaque vecteur a l identique`() {
        stepCases.forEach { case ->
            val geometry = RiverLaneResolver.resolveRiverLanes(RiverVectorFixtures.lanesInput(case.input.getValue("lanes").jsonObject))
            val direction = RiverStepDirection.fromWire(case.input.getValue("direction").jsonPrimitive.content)
            assertWithMessage("[${case.label}] direction inconnue").that(direction).isNotNull()
            val step = RiverLaneQueries.resolveRiverStep(
                ResolveRiverStepInput(geometry, RiverVectorFixtures.cursor(case.input.getValue("cursor").jsonObject), direction!!),
            )
            val expected = case.expected!!.jsonObject
            assertWithMessage("[${case.label}] cursor").that(step.cursor)
                .isEqualTo(RiverVectorFixtures.cursor(expected.getValue("cursor").jsonObject))
            assertWithMessage("[${case.label}] reason").that(step.reason.wire)
                .isEqualTo(expected.getValue("reason").jsonPrimitive.content)
        }
    }

    @Test
    fun `resolveRiverLaneHeaders rejoue chaque vecteur a l identique`() {
        headerCases.forEach { case ->
            val geometry = RiverLaneResolver.resolveRiverLanes(RiverVectorFixtures.lanesInput(case.input.getValue("lanes").jsonObject))
            val headers = RiverLaneHeaders.resolveRiverLaneHeaders(
                ResolveRiverLaneHeadersInput(
                    geometry = geometry,
                    focusRank = case.input.getValue("focusRank").jsonPrimitive.content.toDouble(),
                    fadeRanks = case.input["fadeRanks"]?.jsonPrimitive?.content?.toIntOrNull(),
                ),
            )
            val expected = RiverVectorFixtures.headers(case.expected!!.jsonArray)
            assertWithMessage("[${case.label}] nombre d'en-têtes").that(headers.size).isEqualTo(expected.size)
            headers.zip(expected).forEach { (actual, wanted) ->
                assertWithMessage("[${case.label}] en-tête").that(actual.copy(alpha = 0.0)).isEqualTo(wanted.copy(alpha = 0.0))
                assertWithMessage("[${case.label}] alpha").that(actual.alpha).isWithin(1e-9).of(wanted.alpha)
            }
        }
    }
}
