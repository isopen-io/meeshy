package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.ActiveCallSession
import org.junit.Test

/**
 * Pure decision: *when* the header « Rejoindre » pill is offered. Isolated from
 * the Composable so both branches are unit-tested (same discipline as
 * `CallPillPresenter`). Parité iOS: the rejoin affordance appears only when a
 * call the LOCAL session lost is still live server-side — never while this
 * device is already engaged in a call (a minimised/floating call showing chat),
 * where offering « Rejoindre » for a call you're already in is a nonsense.
 */
class RejoinPillPolicyTest {

    private fun session(id: String = "call-1") = ActiveCallSession(
        id = id,
        conversationId = "conv-1",
        mode = "p2p",
        status = "active",
    )

    @Test
    fun `offers rejoin when a call is live server-side and none locally`() {
        assertThat(RejoinPillPolicy.shouldOffer(serverActiveCall = session(), hasLocalLiveCall = false))
            .isTrue()
    }

    @Test
    fun `no rejoin when no call is active server-side`() {
        assertThat(RejoinPillPolicy.shouldOffer(serverActiveCall = null, hasLocalLiveCall = false))
            .isFalse()
    }

    @Test
    fun `no rejoin while this device is already in a live call`() {
        // The floating call pill is already showing; a « Rejoindre » header pill
        // for the very call you're in would be nonsense.
        assertThat(RejoinPillPolicy.shouldOffer(serverActiveCall = session(), hasLocalLiveCall = true))
            .isFalse()
    }

    @Test
    fun `no rejoin when neither server nor local report a call`() {
        assertThat(RejoinPillPolicy.shouldOffer(serverActiveCall = null, hasLocalLiveCall = true))
            .isFalse()
    }
}
