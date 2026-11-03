package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SilentPushPlanTest {
    private fun payload(type: String, unread: Int? = null, conv: Int? = null) = PushPayload(
        type = type, conversationId = "c1", messageId = "m1", unreadCount = unread, conversationUnread = conv,
    )

    @Test
    fun `an arriving message refreshes its messages and the list and carries its counters`() {
        val plan = SilentPushPlan.of(payload("new_message", unread = 7, conv = 2))

        assertThat(plan.bellUnread).isEqualTo(7)
        assertThat(plan.conversationUnread).isEqualTo("c1" to 2)
        assertThat(plan.refreshMessagesOf).isEqualTo("c1")
        assertThat(plan.refreshConversationList).isTrue()
    }

    @Test
    fun `a reaction refreshes the messages but never advances the list row`() {
        val plan = SilentPushPlan.of(payload("message_reaction"))

        assertThat(plan.refreshMessagesOf).isEqualTo("c1")
        assertThat(plan.refreshConversationList).isFalse()
    }

    @Test
    fun `a push with nothing to sync has an empty plan`() {
        assertThat(SilentPushPlan.of(PushPayload(type = "friend_request")).isEmpty).isTrue()
    }

    @Test
    fun `counters alone need no network`() {
        val plan = SilentPushPlan.of(PushPayload(type = "post_like", unreadCount = 3))

        assertThat(plan.bellUnread).isEqualTo(3)
        assertThat(plan.needsNetwork).isFalse()
    }
}
