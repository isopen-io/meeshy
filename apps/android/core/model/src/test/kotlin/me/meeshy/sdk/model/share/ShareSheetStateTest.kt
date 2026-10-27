package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareSheetStateTest {
    private fun conv(id: String, title: String = "Conv $id", peer: String? = null) = ShareRecipient.conversation(
        conversationId = id, title = title, detail = if (peer != null) ShareRecipient.Detail.Direct else ShareRecipient.Detail.Group(3),
        avatarUrl = null, accentHex = "#6366F1", peerUserId = peer,
    )

    private fun person(id: String, title: String = "Person $id") =
        ShareRecipient.person(id, title, ShareRecipient.Detail.FriendWithoutConversation, null)

    @Test
    fun `a person whose direct conversation is listed is absorbed by it and ids never repeat`() {
        val merged = ShareRecipientMerge.merge(
            conversations = listOf(conv("1", peer = "u1"), conv("1", peer = "u1"), conv("2")),
            people = listOf(person("u1"), person("u3"), person("u3")),
        )
        assertThat(merged.map { it.id }).containsExactly("conv:1", "conv:2", "user:u3").inOrder()
    }

    @Test
    fun `the name filter ignores case and accents and a blank query keeps everything`() {
        val all = listOf(conv("1", "Léa Dupont"), conv("2", "Équipe Paris"), conv("3", "Zoé"))
        assertThat(ShareRecipientMerge.matching(all, "lea").map { it.id }).containsExactly("conv:1")
        assertThat(ShareRecipientMerge.matching(all, " EQUIPE ").map { it.id }).containsExactly("conv:2")
        assertThat(ShareRecipientMerge.matching(all, "  ")).isEqualTo(all)
    }

    @Test
    fun `touching a row toggles it and a served row is inert while a failed one can be retried`() {
        val a = conv("1")
        var state = ShareSheetState().toggled(a)
        assertThat(state.isSelected(a)).isTrue()
        assertThat(state.toggled(a).selection).isEmpty()

        state = state.withDelivery(a.id, ShareDelivery.Sent)
        assertThat(state.toggled(a)).isEqualTo(state)
        assertThat(state.pending).isEmpty()

        state = state.withDelivery(a.id, ShareDelivery.Failed(ShareFailure.GENERIC))
        assertThat(state.pending).containsExactly(a)
        assertThat(state.toggled(a).isSelected(a)).isFalse()
    }

    @Test
    fun `the caption is capped and the chosen duration never exceeds the flame of the source`() {
        val state = ShareSheetState().withCaption("x".repeat(ShareLimits.MAX_CAPTION_LENGTH + 10))
        assertThat(state.caption).hasLength(ShareLimits.MAX_CAPTION_LENGTH)
        val flame = SharePlanner.plan(
            ShareEntry.Messages(listOf(ShareMessage(id = "m", effectFlags = me.meeshy.sdk.model.MessageEffectFlags.EPHEMERAL, ephemeralDuration = 60.0))),
        )
        assertThat(state.withDuration(600, flame).chosenDurationSeconds).isEqualTo(60)
        assertThat(state.withDuration(30, flame).chosenDurationSeconds).isEqualTo(30)
        assertThat(state.withDuration(null, flame).chosenDurationSeconds).isNull()
    }

    @Test
    fun `sending state is told from sent state`() {
        val a = conv("1")
        val sending = ShareSheetState().toggled(a).withDelivery(a.id, ShareDelivery.Sending)
        assertThat(sending.isSending).isTrue()
        assertThat(sending.hasSent).isFalse()
        assertThat(sending.withDelivery(a.id, ShareDelivery.Queued).hasSent).isTrue()
    }
}
