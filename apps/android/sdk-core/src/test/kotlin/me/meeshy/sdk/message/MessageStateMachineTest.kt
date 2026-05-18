package me.meeshy.sdk.message

import com.google.common.truth.Truth.assertThat
import org.junit.Test

private fun transition(from: MessageDeliveryState, event: MessageEvent) =
    MessageStateMachine.transition(from, event)

class MessageStateMachineTest {

    @Test
    fun `happy path advances queued through to read`() {
        var state = MessageDeliveryState.QUEUED
        state = transition(state, MessageEvent.SendStarted)
        assertThat(state).isEqualTo(MessageDeliveryState.SENDING)
        state = transition(state, MessageEvent.GatewayAck)
        assertThat(state).isEqualTo(MessageDeliveryState.SENT)
        state = transition(state, MessageEvent.DeliveryReceipt)
        assertThat(state).isEqualTo(MessageDeliveryState.DELIVERED)
        state = transition(state, MessageEvent.ReadReceipt)
        assertThat(state).isEqualTo(MessageDeliveryState.READ)
    }

    @Test
    fun `progress never regresses on an out-of-order receipt`() {
        val read = MessageDeliveryState.READ
        assertThat(transition(read, MessageEvent.DeliveryReceipt)).isEqualTo(read)
        assertThat(transition(read, MessageEvent.GatewayAck)).isEqualTo(read)
    }

    @Test
    fun `a duplicate receipt is idempotent`() {
        assertThat(transition(MessageDeliveryState.SENT, MessageEvent.GatewayAck))
            .isEqualTo(MessageDeliveryState.SENT)
    }

    @Test
    fun `a read receipt may skip the delivered state`() {
        assertThat(transition(MessageDeliveryState.SENT, MessageEvent.ReadReceipt))
            .isEqualTo(MessageDeliveryState.READ)
    }

    @Test
    fun `send failure then retry then send`() {
        var state = transition(MessageDeliveryState.SENDING, MessageEvent.SendFailed)
        assertThat(state).isEqualTo(MessageDeliveryState.FAILED)
        state = transition(state, MessageEvent.RetryScheduled)
        assertThat(state).isEqualTo(MessageDeliveryState.RETRYING)
        state = transition(state, MessageEvent.SendStarted)
        assertThat(state).isEqualTo(MessageDeliveryState.SENDING)
    }

    @Test
    fun `failure is exhausted after giving up`() {
        val failed = transition(MessageDeliveryState.SENDING, MessageEvent.SendFailed)
        assertThat(transition(failed, MessageEvent.Exhausted))
            .isEqualTo(MessageDeliveryState.EXHAUSTED)
    }

    @Test
    fun `a late gateway ack overrides a failure state`() {
        assertThat(transition(MessageDeliveryState.FAILED, MessageEvent.GatewayAck))
            .isEqualTo(MessageDeliveryState.SENT)
        assertThat(transition(MessageDeliveryState.EXHAUSTED, MessageEvent.ReadReceipt))
            .isEqualTo(MessageDeliveryState.READ)
    }

    @Test
    fun `a sent message cannot regress to failed`() {
        assertThat(transition(MessageDeliveryState.SENT, MessageEvent.SendFailed))
            .isEqualTo(MessageDeliveryState.SENT)
    }

    @Test
    fun `retry is only valid from failed`() {
        assertThat(transition(MessageDeliveryState.SENDING, MessageEvent.RetryScheduled))
            .isEqualTo(MessageDeliveryState.SENDING)
    }
}
