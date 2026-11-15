package me.meeshy.sdk.model.send

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.model.net.NewcomerSlowMode
import org.junit.Test

class SendFailureMappingTest {

    @Test
    fun `chaque cause a son message`() {
        val cases = mapOf(
            SendFailure.Ineligible to SendFailureMessage.INELIGIBLE,
            SendFailure.OfflineEnqueueFailed("x") to SendFailureMessage.OFFLINE_ENQUEUE_FAILED,
            SendFailure.WriteRestricted(ConversationWriteRestriction.MinorGlobal) to SendFailureMessage.WRITE_RESTRICTED,
            SendFailure.SlowMode(NewcomerSlowMode(30)) to SendFailureMessage.SLOW_MODE,
            SendFailure.RecipientBlocked to SendFailureMessage.RECIPIENT_BLOCKED,
            SendFailure.QueuedForRetry("x") to SendFailureMessage.QUEUED_FOR_RETRY,
            SendFailure.RetryEnqueueFailed("x") to SendFailureMessage.RETRY_ENQUEUE_FAILED,
        )
        cases.forEach { (failure, key) -> assertThat(failure.messageKey).isEqualTo(key) }
        assertThat(cases.values.toSet()).hasSize(SendFailureMessage.entries.size)
    }

    @Test
    fun `seul le mode lent expose des secondes`() {
        assertThat(SendFailure.SlowMode(NewcomerSlowMode(30)).retryAfterSeconds).isEqualTo(30)
        assertThat(SendFailure.RecipientBlocked.retryAfterSeconds).isNull()
    }

    @Test
    fun `hors ligne le recu est mis en file, en ligne il est accuse avec son transport`() {
        val queued = SentMessageReceipt("cid", SentMessageReceipt.Delivery.QueuedOffline)
        val acked = SentMessageReceipt(
            "cid", SentMessageReceipt.Delivery.Acknowledged("srv", 5L, SentMessageReceipt.Transport.REST),
        )
        assertThat(queued.isQueuedOffline).isTrue()
        assertThat(acked.isQueuedOffline).isFalse()
    }
}
