package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushPrefetchPolicyTest {
    private fun payload(type: String?, conversationId: String? = "c1", messageId: String? = "m1", postId: String? = null) =
        PushPayload(type = type, conversationId = conversationId, messageId = messageId, postId = postId)

    @Test
    fun `message reply and mention arrivals are prefetched and acknowledged`() {
        listOf("new_message", "message_reply", "user_mentioned").forEach { type ->
            val plan = PushPrefetchPolicy.plan(payload(type))
            assertThat(plan.message).isEqualTo(PushMessageRef("c1", "m1"))
            assertThat(plan.deliveryReceipt).isEqualTo(PushMessageRef("c1", "m1"))
        }
    }

    @Test
    fun `a reaction never writes a message`() {
        val plan = PushPrefetchPolicy.plan(payload("message_reaction"))
        assertThat(plan.isEmpty).isTrue()
    }

    @Test
    fun `joining a conversation acknowledges delivery without fetching a message`() {
        val plan = PushPrefetchPolicy.plan(payload("added_to_conversation"))
        assertThat(plan.message).isNull()
        assertThat(plan.deliveryReceipt).isNotNull()
    }

    @Test
    fun `a social push prefetches its post only`() {
        val plan = PushPrefetchPolicy.plan(payload("post_comment", conversationId = null, messageId = null, postId = "p1"))
        assertThat(plan).isEqualTo(PushPrefetchPlan(postId = "p1"))
    }

    @Test
    fun `missing identifiers or type yield an empty plan`() {
        assertThat(PushPrefetchPolicy.plan(payload("new_message", messageId = null)).isEmpty).isTrue()
        assertThat(PushPrefetchPolicy.plan(payload("new_message", conversationId = " ")).isEmpty).isTrue()
        assertThat(PushPrefetchPolicy.plan(payload(null)).isEmpty).isTrue()
        assertThat(PushPrefetchPolicy.plan(payload("post_like", postId = null)).isEmpty).isTrue()
    }
}
