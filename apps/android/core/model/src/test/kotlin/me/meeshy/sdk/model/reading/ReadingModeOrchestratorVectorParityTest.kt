package me.meeshy.sdk.model.reading

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.junit.Test

/** Rejoue `reading-modes/orchestrator.vectors.json` : le contrat TS / iOS / Android de la décision d'ouverture. */
class ReadingModeOrchestratorVectorParityTest {

    @Test
    fun `chaque vecteur de l orchestrateur est rejoue a l identique`() {
        val vectors = ReadingVectors.load("orchestrator.vectors.json")
        assertThat(vectors).isNotEmpty()
        vectors.forEach { vector ->
            val input = vector.input
            val decision = ReadingModeOrchestrator.resolveOrchestratorDecision(
                OrchestratorDecisionInput(
                    unreadCount = input.getValue("unreadCount").jsonPrimitive.content.toInt(),
                    lastOpenedAtMs = input["lastOpenedAt"]?.jsonPrimitive?.longOrNull,
                    nowMs = input.getValue("now").jsonPrimitive.content.toLong(),
                    stickyChoice = requireNotNull(
                        ReadingModePreference.fromWire(input.getValue("stickyChoice").jsonPrimitive.content),
                    ),
                    capabilities = ReadingVectors.capabilities(input.getValue("capabilities").jsonObject),
                    isFlagEnabled = input.getValue("isFlagEnabled").jsonPrimitive.content.toBoolean(),
                ),
            )
            val expected = vector.expected.jsonObject
            assertWithMessage("${vector.label} · mode").that(decision.mode.wire)
                .isEqualTo(expected.getValue("mode").jsonPrimitive.content)
            assertWithMessage("${vector.label} · raison").that(decision.reason.wire)
                .isEqualTo(expected.getValue("reason").jsonPrimitive.content)
            assertWithMessage("${vector.label} · mode suggere du pont")
                .that(ReadingModeOrchestrator.toBridgeSuggestedMode(decision).wire)
                .isEqualTo(vector.body.getValue("expectedBridgeSuggestedMode").jsonPrimitive.content)
        }
    }
}
