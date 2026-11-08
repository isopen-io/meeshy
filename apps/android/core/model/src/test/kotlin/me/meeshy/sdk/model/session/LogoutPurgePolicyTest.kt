package me.meeshy.sdk.model.session

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LogoutPurgePolicyTest {

    @Test
    fun `la purge est inconditionnelle quelle que soit la cause et la file`() {
        for (cause in PurgeCause.values()) {
            for (pending in listOf(0, 1, 7)) {
                assertThat(LogoutPurgePolicy.decide(cause, pending).purge).isTrue()
            }
        }
    }

    @Test
    fun `une invalidation serveur avec des envois en attente previent de la perte`() {
        val decision = LogoutPurgePolicy.decide(PurgeCause.SERVER_INVALIDATION, pendingSends = 3)

        assertThat(decision.warnLostSends).isTrue()
        assertThat(decision.lostSends).isEqualTo(3)
    }

    @Test
    fun `une invalidation serveur sans envoi en attente ne previent pas`() {
        assertThat(LogoutPurgePolicy.decide(PurgeCause.SERVER_INVALIDATION, 0).warnLostSends).isFalse()
    }

    @Test
    fun `une deconnexion volontaire ne previent jamais meme avec des envois en attente`() {
        val decision = LogoutPurgePolicy.decide(PurgeCause.USER_LOGOUT, pendingSends = 5)

        assertThat(decision.purge).isTrue()
        assertThat(decision.warnLostSends).isFalse()
        assertThat(decision.lostSends).isEqualTo(0)
    }

    @Test
    fun `un demarrage deconnecte purge sans prevenir`() {
        assertThat(LogoutPurgePolicy.decide(PurgeCause.SIGNED_OUT_AT_LAUNCH, 2).warnLostSends).isFalse()
    }

    @Test
    fun `un demarrage a froid sur session valide ne purge pas`() {
        assertThat(LogoutPurgePolicy.purgeAtLaunch(hasSession = true)).isFalse()
        assertThat(LogoutPurgePolicy.purgeAtLaunch(hasSession = false)).isTrue()
    }

    @Test
    fun `un compte negatif est ramene a zero`() {
        assertThat(LogoutPurgePolicy.decide(PurgeCause.SERVER_INVALIDATION, -4).warnLostSends).isFalse()
    }
}
