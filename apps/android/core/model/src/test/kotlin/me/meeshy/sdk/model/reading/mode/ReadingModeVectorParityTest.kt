package me.meeshy.sdk.model.reading.mode

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/**
 * Rejoue `packages/shared/fixtures/reading-modes/{orchestrator,capabilities}.vectors.json` — ce que
 * la loi TypeScript (qui fait foi) a produit — contre [ReadingModeOrchestrator].
 */
class ReadingModeVectorParityTest {

    private fun cases(name: String): List<JsonObject> =
        Json.parseToJsonElement(SharedFixtures.file("reading-modes/$name").readText()).jsonArray.map { it.jsonObject }

    private fun capabilitiesOf(obj: JsonObject): ReadingModeCapabilities {
        val reason = obj.getValue("riverEligibilityReason").jsonObject
        return ReadingModeCapabilities(
            availableModes = obj.getValue("availableModes").jsonArray.map {
                checkNotNull(ConversationReadingMode.fromWire(it.jsonPrimitive.content))
            },
            riverEligible = obj.getValue("riverEligible").jsonPrimitive.boolean,
            riverEligibilityReason = RiverEligibilityReason(
                threshold = reason.getValue("threshold").jsonPrimitive.int,
                current = reason["current"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.int,
                riverReason = RiverEligibilityReasonKind.entries.first { it.wire == reason.getValue("riverReason").jsonPrimitive.content },
            ),
        )
    }

    @Test
    fun `every orchestrator vector yields the TypeScript decision and bridge projection`() {
        val vectors = cases("orchestrator.vectors.json")
        assertThat(vectors.size).isAtLeast(22)
        vectors.forEach { case ->
            val label = case["_label"]?.jsonPrimitive?.content ?: "?"
            val input = case.getValue("input").jsonObject
            val lastOpened = input["lastOpenedAt"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.long
            val decision = ReadingModeOrchestrator.resolveOrchestratorDecision(
                unreadCount = input.getValue("unreadCount").jsonPrimitive.int,
                lastOpenedAtMs = lastOpened,
                nowMs = input.getValue("now").jsonPrimitive.long,
                stickyChoice = checkNotNull(ReadingModePreference.fromWire(input.getValue("stickyChoice").jsonPrimitive.content)),
                capabilities = capabilitiesOf(input.getValue("capabilities").jsonObject),
                isFlagEnabled = input.getValue("isFlagEnabled").jsonPrimitive.boolean,
            )
            val expected = case.getValue("expected").jsonObject
            assertWithMessage(label).that(decision.mode.wire).isEqualTo(expected.getValue("mode").jsonPrimitive.content)
            assertWithMessage(label).that(decision.reason.wire).isEqualTo(expected.getValue("reason").jsonPrimitive.content)
            case["expectedBridgeSuggestedMode"]?.let {
                assertWithMessage(label).that(ReadingModeOrchestrator.toBridgeSuggestedMode(decision)).isEqualTo(it.jsonPrimitive.content)
            }
        }
    }

    @Test
    fun `every capabilities vector yields the TypeScript catalogue`() {
        val vectors = cases("capabilities.vectors.json")
        assertThat(vectors.size).isAtLeast(18)
        vectors.forEach { case ->
            val label = case["_label"]?.jsonPrimitive?.content ?: "?"
            val input = case.getValue("input").jsonObject
            val actual = ReadingModeOrchestrator.resolveCapabilities(
                isAnonymous = input.getValue("identity").jsonObject.getValue("isAnonymous").jsonPrimitive.boolean,
                isFlagEnabled = input.getValue("isFlagEnabled").jsonPrimitive.boolean,
                isRiverFlagEnabled = input["isRiverFlagEnabled"]?.jsonPrimitive?.boolean ?: false,
                conversationType = ReadingModeConversationType.entries.first {
                    it.wire == input.getValue("conversationType").jsonPrimitive.content
                },
                activeParticipantCount = input["activeParticipantCount"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.int,
            )
            assertWithMessage(label).that(actual).isEqualTo(capabilitiesOf(case.getValue("expected").jsonObject))
        }
    }
}
