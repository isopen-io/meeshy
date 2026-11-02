package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UserActivationRulesTest {

    private val now = WireDate.epochMillis("2026-10-10T12:00:00.000Z")!!

    private fun activation(
        phase: UserActivation.Phase?,
        deadline: String? = "2026-10-20T12:00:00.000Z",
        missing: List<UserActivation.Channel> = listOf(UserActivation.Channel.EMAIL),
    ) = UserActivation(phase = phase, deadline = deadline, missing = missing)

    @Test
    fun `only the invite phase with something missing invites`() {
        assertThat(activation(UserActivation.Phase.INVITE).invites).isTrue()
        assertThat(activation(UserActivation.Phase.INVITE, missing = emptyList()).invites).isFalse()
        listOf(UserActivation.Phase.QUIET, UserActivation.Phase.BLOCKED, UserActivation.Phase.DONE, null)
            .forEach { assertThat(activation(it).invites).isFalse() }
    }

    @Test
    fun `days left round up to the next day`() {
        val oneHourLeft = activation(UserActivation.Phase.INVITE, "2026-10-10T13:00:00.000Z")
        val tenDaysAndABit = activation(UserActivation.Phase.INVITE, "2026-10-20T12:00:01.000Z")

        assertThat(oneHourLeft.daysLeft(now)).isEqualTo(1)
        assertThat(tenDaysAndABit.daysLeft(now)).isEqualTo(11)
    }

    @Test
    fun `days left never go negative and need a readable deadline`() {
        assertThat(activation(UserActivation.Phase.INVITE, "2026-10-01T00:00:00.000Z").daysLeft(now)).isEqualTo(0)
        assertThat(activation(UserActivation.Phase.INVITE, null).daysLeft(now)).isNull()
        assertThat(activation(UserActivation.Phase.INVITE, "pas une date").daysLeft(now)).isNull()
    }

    @Test
    fun `the quiet phase asks nothing and the banner is absent outside invite`() {
        assertThat(UserActivationRules.invite(activation(UserActivation.Phase.QUIET), now)).isNull()
        assertThat(UserActivationRules.invite(activation(UserActivation.Phase.DONE, missing = listOf(UserActivation.Channel.PHONE)), now)).isNull()
        assertThat(UserActivationRules.invite(null, now)).isNull()
    }

    @Test
    fun `the invite phase names what is missing and the days left`() {
        val invite = UserActivationRules.invite(
            activation(UserActivation.Phase.INVITE, missing = listOf(UserActivation.Channel.PHONE)),
            now,
        )

        assertThat(invite).isEqualTo(ActivationInvite(daysLeft = 10, missingEmail = false, missingPhone = true))
    }

    @Test
    fun `the blocked phase leads to the code screen`() {
        assertThat(UserActivationRules.leadsToCodeScreen(activation(UserActivation.Phase.BLOCKED))).isTrue()
        assertThat(UserActivationRules.leadsToCodeScreen(activation(UserActivation.Phase.INVITE))).isFalse()
    }

    @Test
    fun `a deletion status reads as none, pending or grace period`() {
        assertThat(AccountDeletionPhase.from(AccountDeletionStatus())).isEqualTo(AccountDeletionPhase.None)
        assertThat(AccountDeletionPhase.from(AccountDeletionStatus(status = "PENDING_EMAIL_CONFIRMATION")))
            .isEqualTo(AccountDeletionPhase.PendingConfirmation)
        assertThat(
            AccountDeletionPhase.from(
                AccountDeletionStatus(status = "CONFIRMED", gracePeriodEndsAt = "2026-11-01T00:00:00.000Z", canCancelUntil = "2026-11-01T00:00:00.000Z"),
            ),
        ).isEqualTo(AccountDeletionPhase.GracePeriod("2026-11-01T00:00:00.000Z"))
    }
}
