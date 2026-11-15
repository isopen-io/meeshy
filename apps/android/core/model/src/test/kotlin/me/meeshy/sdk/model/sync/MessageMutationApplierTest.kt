package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class MessageMutationApplierTest {
    private val now = "2026-11-03T10:00:00.000Z"

    private fun message(
        content: String = "salut",
        editedAt: String? = null,
        isEdited: Boolean = false,
        deletedAt: String? = null,
        metadata: JsonObject? = null,
    ) = ApiMessage(
        id = "m1", conversationId = "c1", content = content,
        editedAt = editedAt, isEdited = isEdited, deletedAt = deletedAt, metadata = metadata,
    )

    private fun callNotice() = JsonObject(
        mapOf(
            "kind" to JsonPrimitive("call"),
            "callId" to JsonPrimitive("k1"),
            "initiatorId" to JsonPrimitive("u1"),
            "callType" to JsonPrimitive("audio"),
            "outcome" to JsonPrimitive("completed"),
        ),
    )

    private fun twice(current: ApiMessage?, mutation: MessageMutation): Pair<ApiMessage?, ApiMessage?> {
        val once = MessageMutationApplier.apply(current, mutation, now)
        return once to MessageMutationApplier.apply(once, mutation, now)
    }

    @Test
    fun `une edition appliquee deux fois laisse le meme etat`() {
        val (once, again) = twice(message(), MessageMutation.Edited(message("corrige", "2026-11-03T09:00:00.000Z", true)))
        assertThat(once?.content).isEqualTo("corrige")
        assertThat(again).isEqualTo(once)
    }

    @Test
    fun `une edition plus ancienne ne regresse pas une edition plus recente`() {
        val current = message("recent", "2026-11-03T09:30:00.000Z", true)
        val stale = MessageMutation.Edited(message("vieux", "2026-11-03T09:00:00.000Z", true))
        assertThat(MessageMutationApplier.apply(current, stale, now)).isEqualTo(current)
    }

    @Test
    fun `un avis d'appel termine ne porte jamais modifie`() {
        val edited = message("Appel termine", "2026-11-03T09:00:00.000Z", true, metadata = callNotice())
        val (once, again) = twice(message(metadata = callNotice()), MessageMutation.Edited(edited))
        assertThat(once?.isEdited).isFalse()
        assertThat(once?.editedAt).isNull()
        assertThat(again).isEqualTo(once)
    }

    @Test
    fun `un message ordinaire edite garde la mention modifie`() {
        val (once, _) = twice(message(), MessageMutation.Edited(message("v2", "2026-11-03T09:00:00.000Z", true)))
        assertThat(once?.isEdited).isTrue()
    }

    @Test
    fun `une suppression appliquee deux fois garde la premiere date`() {
        val (once, again) = twice(message(), MessageMutation.Deleted("c1", "m1", "2026-11-03T08:00:00.000Z"))
        assertThat(once?.deletedAt).isEqualTo("2026-11-03T08:00:00.000Z")
        assertThat(again).isEqualTo(once)
    }

    @Test
    fun `une expiration pose l'instant fourni et reste idempotente`() {
        val (once, again) = twice(message(), MessageMutation.Expired("c1", "m1"))
        assertThat(once?.deletedAt).isEqualTo(now)
        assertThat(again).isEqualTo(once)
    }

    @Test
    fun `supprimer ou expirer un message inconnu ne cree rien`() {
        assertThat(MessageMutationApplier.apply(null, MessageMutation.Deleted("c1", "m1"), now)).isNull()
        assertThat(MessageMutationApplier.apply(null, MessageMutation.Expired("c1", "m1"), now)).isNull()
    }
}
