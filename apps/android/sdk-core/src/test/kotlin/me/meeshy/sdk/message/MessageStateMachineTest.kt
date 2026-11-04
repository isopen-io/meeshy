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

    @Test
    fun `applyEvent rejects a regression with null and accepts an advance`() {
        assertThat(MessageStateMachine.applyEvent(MessageDeliveryState.READ, MessageEvent.DeliveryReceipt)).isNull()
        assertThat(MessageStateMachine.applyEvent(MessageDeliveryState.SENT, MessageEvent.DeliveryReceipt))
            .isEqualTo(MessageDeliveryState.DELIVERED)
    }

    @Test
    fun `applyEvent rejects a replayed receipt so it stays idempotent`() {
        assertThat(MessageStateMachine.applyEvent(MessageDeliveryState.DELIVERED, MessageEvent.DeliveryReceipt)).isNull()
        assertThat(MessageStateMachine.applyEvent(MessageDeliveryState.READ, MessageEvent.ReadReceipt)).isNull()
    }

    @Test
    fun `applyEvent rejects an invalid transition`() {
        assertThat(MessageStateMachine.applyEvent(MessageDeliveryState.SENT, MessageEvent.SendFailed)).isNull()
        assertThat(MessageStateMachine.applyEvent(MessageDeliveryState.SENDING, MessageEvent.RetryScheduled)).isNull()
    }

    @Test
    fun `every state survives a persisted round trip`() {
        MessageDeliveryState.entries.forEach { state ->
            assertThat(MessageDeliveryState.fromPersisted(state.persistedName)).isEqualTo(state)
        }
    }

    @Test
    fun `an unknown persisted name reads as null instead of crashing`() {
        assertThat(MessageDeliveryState.fromPersisted("FROM_THE_FUTURE")).isNull()
        assertThat(MessageDeliveryState.fromPersisted(null)).isNull()
    }

    @Test
    fun `the legacy local send states read as delivery states`() {
        assertThat(MessageDeliveryState.fromPersisted("SENDING")).isEqualTo(MessageDeliveryState.SENDING)
        assertThat(MessageDeliveryState.fromPersisted("FAILED")).isEqualTo(MessageDeliveryState.FAILED)
    }

    @Test
    fun `iOS vocabulary maps to the events and replays are idempotent`() {
        val events = IosMessageEvents
        assertThat(events.event("serverAck")).isEqualTo(MessageEvent.GatewayAck)
        assertThat(events.event("delivered")).isEqualTo(MessageEvent.DeliveryReceipt)
        assertThat(events.event("readBy")).isEqualTo(MessageEvent.ReadReceipt)
        assertThat(events.event("sendFailed")).isEqualTo(MessageEvent.SendFailed)
        assertThat(events.event("retry")).isEqualTo(MessageEvent.RetryScheduled)
        assertThat(events.event("retryExhausted")).isEqualTo(MessageEvent.Exhausted)
        assertThat(events.event("startSending")).isEqualTo(MessageEvent.SendStarted)
        assertThat(events.event("enqueue")).isNull()
        assertThat(events.event("unknown")).isNull()
    }

    @Test
    fun `deliveries are derived from the stored counters and never go backwards`() {
        fun derive(sendState: String?, delivered: Int = 0, read: Int = 0, retries: Int = 0) =
            MessageStateMachine.derive(sendState, deliveredCount = delivered, readCount = read, retryCount = retries)
        assertThat(derive("SENDING")).isEqualTo(MessageDeliveryState.SENDING)
        assertThat(derive("SENDING", retries = 2)).isEqualTo(MessageDeliveryState.RETRYING)
        assertThat(derive("FAILED")).isEqualTo(MessageDeliveryState.FAILED)
        assertThat(derive("EXHAUSTED")).isEqualTo(MessageDeliveryState.EXHAUSTED)
        assertThat(derive(null)).isEqualTo(MessageDeliveryState.SENT)
        assertThat(derive(null, delivered = 1)).isEqualTo(MessageDeliveryState.DELIVERED)
        assertThat(derive(null, delivered = 0, read = 1)).isEqualTo(MessageDeliveryState.READ)
        assertThat(derive(null, delivered = 2, read = 2)).isEqualTo(MessageDeliveryState.READ)
    }
}
