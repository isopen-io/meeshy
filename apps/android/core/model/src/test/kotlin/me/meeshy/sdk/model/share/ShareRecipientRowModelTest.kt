package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class ShareRecipientRowModelTest {
    private fun friend() = ShareRecipient.conversation("1", "Léa", ShareRecipient.Detail.Direct, null, null, peerUserId = "u1")
    private fun group() = ShareRecipient.conversation("2", "Équipe Lyon", ShareRecipient.Detail.Group(12), null, null, peerUserId = null)
    private fun row(r: ShareRecipient, presence: PresenceState? = null, selected: Boolean = false, delivery: ShareDelivery? = null) =
        ShareRecipientRowModel(r, presence, selected, delivery)

    @Test
    fun `the spoken label is one sentence - title, detail, online, then selected`() {
        val label = row(friend(), PresenceState.ONLINE, selected = true).spokenLabel("Conversation", "en ligne", "sélectionné", null)
        assertThat(label).isEqualTo("Léa, Conversation, en ligne, sélectionné")
    }

    @Test
    fun `a delivery status replaces the selected mention`() {
        val label = row(friend(), selected = true, delivery = ShareDelivery.Sent).spokenLabel("Conversation", "en ligne", "sélectionné", "Envoyé")
        assertThat(label).isEqualTo("Léa, Conversation, Envoyé")
    }

    @Test
    fun `away and idle are not spoken as online`() {
        assertThat(row(friend(), PresenceState.AWAY).spokenLabel("c", "en ligne", "s", null)).isEqualTo("Léa, c")
    }

    @Test
    fun `offline draws no dot and absent presence draws none either`() {
        assertThat(row(friend(), PresenceState.OFFLINE).showsPresenceDot).isFalse()
        assertThat(row(friend(), null).showsPresenceDot).isFalse()
        assertThat(row(friend(), PresenceState.IDLE).showsPresenceDot).isTrue()
    }

    @Test
    fun `a group never carries a presence and a person takes the served one`() {
        assertThat(ShareRecipientRowModel.presenceOf(group()) { PresenceState.ONLINE }).isNull()
        assertThat(ShareRecipientRowModel.presenceOf(friend()) { PresenceState.AWAY }).isEqualTo(PresenceState.AWAY)
        assertThat(ShareRecipientRowModel.presenceOf(friend()) { null }).isNull()
    }

    @Test
    fun `a served row is inert and a failed one offers retry`() {
        assertThat(row(friend(), delivery = ShareDelivery.Queued).isServed).isTrue()
        assertThat(row(friend(), delivery = ShareDelivery.Failed(ShareFailure.GENERIC)).isServed).isFalse()
        assertThat(row(friend(), delivery = ShareDelivery.Failed(ShareFailure.GENERIC)).showsRetry).isTrue()
        assertThat(row(friend(), delivery = ShareDelivery.Sending).status).isEqualTo(ShareRowStatus.SENDING)
        assertThat(row(friend()).status).isNull()
    }
}
