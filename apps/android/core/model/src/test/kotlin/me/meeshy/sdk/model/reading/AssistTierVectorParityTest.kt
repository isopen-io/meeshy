package me.meeshy.sdk.model.reading

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Rejoue `reading-modes/assist-tier.vectors.json`. */
class AssistTierVectorParityTest {

    @Test
    fun `chaque vecteur de la cascade d assistance est rejoue a l identique`() {
        val vectors = ReadingVectors.load("assist-tier.vectors.json")
        assertThat(vectors).isNotEmpty()
        vectors.forEach { vector ->
            val input = vector.input
            val tier = AssistTierResolver.resolve(
                AssistTierInput(
                    deviceCapability = input.getValue("deviceCapability").jsonPrimitive.content.toBoolean(),
                    encryptionMode = ReadingEncryptionMode.fromWire(input["encryptionMode"]?.jsonPrimitive?.content),
                    userConsent = input.getValue("userConsent").jsonPrimitive.content.toBoolean(),
                    conversationType = ReadingConversationType.fromWire(input.getValue("conversationType").jsonPrimitive.content),
                ),
            )
            assertWithMessage(vector.label).that(tier.wire).isEqualTo(vector.expected.jsonPrimitive.content)
        }
    }

    @Test
    fun `aucun appareil n est jamais capable aujourd hui`() {
        assertThat(AssistCapabilityProbing.NEVER_CAPABLE.probe(ReadingConversationType.GROUP)).isFalse()
    }
}
