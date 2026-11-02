package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/**
 * Rejoue `packages/shared/fixtures/action-policy/message-actions.vectors.json`, généré en
 * EXÉCUTANT `messageActionsFor` (TypeScript, qui fait foi) : type, drapeaux, groupes et verdicts
 * doivent sortir À L'IDENTIQUE de [MessageActionPolicy]. Même rejeu que
 * `MessageActionPolicyVectorTests.swift`.
 */
class MessageActionPolicyVectorParityTest {

    private val vectors = SharedFixtures.vectors(ActionPolicyVectorFixtures.MESSAGE_VECTORS)

    @Test
    fun `the shared message vectors are loaded`() {
        assertThat(vectors.size).isAtLeast(90)
    }

    @Test
    fun `every message vector yields the same kind, groups and verdicts as the TypeScript law`() {
        vectors.forEach { vector ->
            val actual = ActionPolicyVectorFixtures.render(
                MessageActionPolicy.actionsFor(ActionPolicyVectorFixtures.messageInput(vector.input)),
            )
            assertWithMessage(vector.label ?: "vecteur sans étiquette").that(actual).isEqualTo(vector.expected)
        }
    }

    @Test
    fun `every action of the vectors decodes to a Kotlin action`() {
        val wires = MessageActionPolicy.Action.entries.map { it.wireValue }
        assertThat(wires).containsNoDuplicates()
        wires.forEach { wire -> assertThat(MessageActionPolicy.Action.fromWire(wire)?.wireValue).isEqualTo(wire) }
    }
}
