package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class MarksEditedRuleTest {
    private fun message(isEdited: Boolean, metadata: JsonObject? = null) =
        ApiMessage(id = "m1", conversationId = "c1", content = "x", isEdited = isEdited, metadata = metadata)

    private fun callNotice() = JsonObject(
        mapOf(
            "kind" to JsonPrimitive("call"),
            "callId" to JsonPrimitive("k1"),
            "initiatorId" to JsonPrimitive("u1"),
            "callType" to JsonPrimitive("audio"),
            "outcome" to JsonPrimitive("completed"),
        ),
    )

    @Test
    fun `un avis d'appel complete ne pose jamais modifie`() {
        assertThat(MessageEditMarks.marksEdited(message(isEdited = true, metadata = callNotice()))).isFalse()
    }

    @Test
    fun `un texte corrige pose modifie`() {
        assertThat(MessageEditMarks.marksEdited(message(isEdited = true))).isTrue()
    }

    @Test
    fun `un message que le serveur ne dit pas modifie ne l'est pas`() {
        assertThat(MessageEditMarks.marksEdited(message(isEdited = false))).isFalse()
    }
}
