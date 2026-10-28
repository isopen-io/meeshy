package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareServedTest {
    private fun person(id: String) = ShareRecipient.person(id, "Ami $id", ShareRecipient.Detail.FriendWithoutConversation, null)
    private fun group(id: String) = ShareRecipient.conversation(id, "Groupe $id", ShareRecipient.Detail.Group(4), null, null, null)

    @Test
    fun `the first recipient served is the one the confirmation names`() {
        val state = ShareSheetState()
            .served(person("u1"), conversationId = "c1", queued = false)
            .served(group("g2"), conversationId = "g2", queued = false)
        assertThat(state.firstServed?.recipient?.id).isEqualTo("user:u1")
        assertThat(state.firstServed?.conversationId).isEqualTo("c1")
        assertThat(state.deliveries["user:u1"]).isEqualTo(ShareDelivery.Sent)
        assertThat(state.deliveries["conv:g2"]).isEqualTo(ShareDelivery.Sent)
    }

    @Test
    fun `an offline share is queued yet still confirmed`() {
        val state = ShareSheetState().served(group("g1"), conversationId = "g1", queued = true)
        assertThat(state.deliveries["conv:g1"]).isEqualTo(ShareDelivery.Queued)
        assertThat(state.firstServed?.recipient?.isGroup).isTrue()
    }

    @Test
    fun `a failure never becomes the confirmation`() {
        val state = ShareSheetState().withDelivery("user:u1", ShareDelivery.Failed(ShareFailure.UNREACHABLE))
        assertThat(state.firstServed).isNull()
    }
}
