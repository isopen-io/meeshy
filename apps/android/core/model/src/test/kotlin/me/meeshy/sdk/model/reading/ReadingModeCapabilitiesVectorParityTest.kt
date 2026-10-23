package me.meeshy.sdk.model.reading

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import org.junit.Test

/** Rejoue `reading-modes/capabilities.vectors.json`. */
class ReadingModeCapabilitiesVectorParityTest {

    @Test
    fun `chaque vecteur de capacites est rejoue a l identique`() {
        val vectors = ReadingVectors.load("capabilities.vectors.json")
        assertThat(vectors).isNotEmpty()
        vectors.forEach { vector ->
            val input = vector.input
            val actual = ReadingModeCapabilitiesResolver.resolve(
                ResolveCapabilitiesInput(
                    identity = ReadingModeIdentity(
                        input.getValue("identity").jsonObject.getValue("isAnonymous").jsonPrimitive.content.toBoolean(),
                    ),
                    isFlagEnabled = input.getValue("isFlagEnabled").jsonPrimitive.content.toBoolean(),
                    isRiverFlagEnabled = input["isRiverFlagEnabled"]?.jsonPrimitive?.content?.toBoolean() ?: false,
                    conversationType = ReadingConversationType.fromWire(input.getValue("conversationType").jsonPrimitive.content),
                    activeParticipantCount = input["activeParticipantCount"]?.jsonPrimitive?.intOrNull,
                ),
            )
            assertWithMessage(vector.label)
                .that(actual).isEqualTo(ReadingVectors.capabilities(vector.expected.jsonObject))
        }
    }
}
