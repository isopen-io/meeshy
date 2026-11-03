package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.SessionOrigin
import org.junit.Test

class PushPermissionTimingTest {
    private fun opened(origin: SessionOrigin?) = PushPermissionTrigger.SessionOpened(origin)

    private fun decide(
        trigger: PushPermissionTrigger,
        pending: Boolean = false,
        holds: Boolean = false,
        sdk: Int = 34,
    ) = PushPermissionTiming.decide(trigger, pending, holds, sdk)

    @Test
    fun `login asks at once`() {
        assertThat(decide(opened(SessionOrigin.LOGIN))).isEqualTo(PushPermissionDecision.ASK_NOW)
    }

    @Test
    fun `restored session asks at once`() {
        assertThat(decide(opened(SessionOrigin.RESTORED))).isEqualTo(PushPermissionDecision.ASK_NOW)
    }

    @Test
    fun `registration postpones even when onboarding does not hold the window`() {
        assertThat(decide(opened(SessionOrigin.REGISTRATION))).isEqualTo(PushPermissionDecision.POSTPONE)
    }

    @Test
    fun `login never asks over the onboarding languages card`() {
        assertThat(decide(opened(SessionOrigin.LOGIN), holds = true)).isEqualTo(PushPermissionDecision.POSTPONE)
    }

    @Test
    fun `cold start with a pending marker respects it`() {
        assertThat(decide(opened(SessionOrigin.RESTORED), pending = true)).isEqualTo(PushPermissionDecision.NOTHING)
    }

    @Test
    fun `first accepted message honours a pending marker`() {
        assertThat(decide(PushPermissionTrigger.FirstMessageAccepted, pending = true))
            .isEqualTo(PushPermissionDecision.ASK_NOW)
    }

    @Test
    fun `first accepted message reposes the marker when onboarding keeps the window`() {
        assertThat(decide(PushPermissionTrigger.FirstMessageAccepted, pending = true, holds = true))
            .isEqualTo(PushPermissionDecision.POSTPONE)
    }

    @Test
    fun `a message without a pending marker does nothing`() {
        assertThat(decide(PushPermissionTrigger.FirstMessageAccepted)).isEqualTo(PushPermissionDecision.NOTHING)
    }

    @Test
    fun `before API 33 nothing is ever asked`() {
        assertThat(decide(opened(SessionOrigin.LOGIN), sdk = 32)).isEqualTo(PushPermissionDecision.NOTHING)
        assertThat(decide(opened(SessionOrigin.REGISTRATION), sdk = 32)).isEqualTo(PushPermissionDecision.NOTHING)
        assertThat(decide(PushPermissionTrigger.FirstMessageAccepted, pending = true, sdk = 32))
            .isEqualTo(PushPermissionDecision.NOTHING)
    }
}
