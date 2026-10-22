package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileActionPlanTest {
    private fun plan(
        connection: ProfileConnection = ProfileConnection.None,
        self: Boolean = false,
        anonymous: Boolean = false,
        blockedByMe: Boolean = false,
        blockedByTarget: Boolean = false,
        calls: Boolean = true,
    ) = ProfileActionPlan.of(self, anonymous, connection, blockedByMe, blockedByTarget, calls)

    @Test
    fun `self has no action`() {
        val p = plan(self = true)
        assertThat(p.connectionActions).isEmpty()
        assertThat(p.offersCall).isFalse()
        assertThat(p.canBlock).isFalse()
        assertThat(p.canReport).isFalse()
        assertThat(p.showsTabs).isTrue()
    }

    @Test
    fun `no relation offers request`() {
        assertThat(plan().connectionActions).containsExactly(ProfileConnectionAction.REQUEST)
    }

    @Test
    fun `sent offers cancel then resend with banner`() {
        val p = plan(ProfileConnection.PendingSent("r"))
        assertThat(p.connectionActions).containsExactly(ProfileConnectionAction.CANCEL, ProfileConnectionAction.RESEND).inOrder()
        assertThat(p.contextBanner).isEqualTo(ProfileContextBanner.SENT)
    }

    @Test
    fun `received offers accept then decline with banner`() {
        val p = plan(ProfileConnection.PendingReceived("r"))
        assertThat(p.connectionActions).containsExactly(ProfileConnectionAction.ACCEPT, ProfileConnectionAction.DECLINE).inOrder()
        assertThat(p.contextBanner).isEqualTo(ProfileContextBanner.RECEIVED)
    }

    @Test
    fun `connected shows the banner and no action`() {
        val p = plan(ProfileConnection.Connected)
        assertThat(p.showsConnectedBanner).isTrue()
        assertThat(p.connectionActions).isEmpty()
    }

    @Test
    fun `blocked by me greys out with only unblock and no tab`() {
        val p = plan(blockedByMe = true)
        assertThat(p.layout).isEqualTo(ProfileLayout.BLOCKED_BY_ME)
        assertThat(p.canUnblock).isTrue()
        assertThat(p.showsTabs).isFalse()
        assertThat(p.connectionActions).isEmpty()
        assertThat(p.interactionsEnabled).isFalse()
        assertThat(p.offersCall).isFalse()
        assertThat(p.canMessage).isFalse()
        assertThat(p.canBlock).isFalse()
    }

    @Test
    fun `blocked by target closes the sheet`() {
        val p = plan(blockedByTarget = true, blockedByMe = true)
        assertThat(p.layout).isEqualTo(ProfileLayout.CLOSED)
        assertThat(p.showsTabs).isFalse()
        assertThat(p.interactionsEnabled).isFalse()
    }

    @Test
    fun `anonymous visitor has neither relation nor call`() {
        val p = plan(anonymous = true, connection = ProfileConnection.Connected)
        assertThat(p.connectionActions).isEmpty()
        assertThat(p.showsConnectedBanner).isFalse()
        assertThat(p.offersCall).isFalse()
        assertThat(p.canMessage).isTrue()
    }

    @Test
    fun `call needs availability`() {
        assertThat(plan(calls = false).offersCall).isFalse()
        assertThat(plan(calls = true).offersCall).isTrue()
        assertThat(plan().interactionsEnabled).isTrue()
    }

    @Test
    fun `accent rules`() {
        assertThat(ProfileAccentRules.BLOCKED_NEUTRAL_HEX).isEqualTo("888888")
        assertThat(ProfileAccentRules.seed("u", "n")).isEqualTo("u")
        assertThat(ProfileAccentRules.seed(null, "n")).isEqualTo("n")
        assertThat(ProfileAccentRules.seed("", "n")).isEqualTo("n")
        assertThat(ProfileAccentRules.accentHex(true, "AAAAAA")).isEqualTo("888888")
        assertThat(ProfileAccentRules.accentHex(false, "AAAAAA")).isEqualTo("AAAAAA")
        assertThat(ProfileTab.DEFAULT).isEqualTo(ProfileTab.DETAILS)
    }
}
