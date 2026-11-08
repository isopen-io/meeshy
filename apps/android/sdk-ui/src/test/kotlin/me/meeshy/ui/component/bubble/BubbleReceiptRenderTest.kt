package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

private data class ReceiptPrefs(
    override val systemLanguage: String? = "fr",
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

class BubbleReceiptRenderTest {

    private fun render(message: ApiMessage, conversationRecipients: Int = 0) = BubbleContentBuilder.build(
        message,
        currentUserId = "me",
        preferences = ReceiptPrefs(),
        recipientCount = conversationRecipients,
    ).deliveryStatus

    private fun own(delivered: Int = 0, read: Int = 0, recipients: Int? = null, deliveredToAllAt: String? = null, readByAllAt: String? = null) =
        ApiMessage(
            id = "m1", conversationId = "c1", content = "salut", senderId = "me",
            deliveredCount = delivered, readCount = read, recipientCount = recipients,
            deliveredToAllAt = deliveredToAllAt, readByAllAt = readByAllAt,
        )

    @Test
    fun `a single check while nobody received it`() {
        assertThat(render(own())).isEqualTo(DeliveryStatus.Sent)
    }

    @Test
    fun `a group message served with its denominator needs every recipient for the double check`() {
        assertThat(render(own(delivered = 2, recipients = 3), conversationRecipients = 1)).isEqualTo(DeliveryStatus.Sent)
        assertThat(render(own(delivered = 3, recipients = 3), conversationRecipients = 1)).isEqualTo(DeliveryStatus.Delivered)
    }

    @Test
    fun `the persisted denominator keeps read by everyone correct without the conversation count`() {
        assertThat(render(own(delivered = 3, read = 2, recipients = 3))).isEqualTo(DeliveryStatus.Delivered)
        assertThat(render(own(delivered = 3, read = 3, recipients = 3))).isEqualTo(DeliveryStatus.Read)
    }

    @Test
    fun `the all-markers win over the counters`() {
        assertThat(render(own(recipients = 3, deliveredToAllAt = "2026-06-01T10:00:00Z"))).isEqualTo(DeliveryStatus.Delivered)
        assertThat(render(own(recipients = 3, readByAllAt = "2026-06-01T10:00:00Z"))).isEqualTo(DeliveryStatus.Read)
    }

    @Test
    fun `without a served denominator the conversation count decides`() {
        assertThat(render(own(delivered = 1, read = 1), conversationRecipients = 4)).isEqualTo(DeliveryStatus.Sent)
        assertThat(render(own(delivered = 1, read = 1), conversationRecipients = 1)).isEqualTo(DeliveryStatus.Read)
    }
}
