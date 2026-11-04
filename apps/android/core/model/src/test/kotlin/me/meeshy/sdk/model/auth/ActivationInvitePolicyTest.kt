package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivation
import me.meeshy.sdk.model.UserActivation.Channel
import org.junit.Test

class ActivationInvitePolicyTest {
    private fun activation(
        phase: UserActivation.Phase? = UserActivation.Phase.INVITE,
        missing: List<Channel> = listOf(Channel.EMAIL, Channel.PHONE),
        deadline: String? = null,
    ) = UserActivation(phase = phase, deadline = deadline, missing = missing)

    private fun user(
        activation: UserActivation? = activation(),
        emailVerifiedAt: String? = null,
        phoneVerifiedAt: String? = null,
        phoneNumber: String? = null,
    ) = MeeshyUser(
        id = "u1", username = "ana", email = "ana@meeshy.me", activation = activation,
        emailVerifiedAt = emailVerifiedAt, phoneVerifiedAt = phoneVerifiedAt, phoneNumber = phoneNumber,
    )

    @Test
    fun `la feuille s'ouvre en phase invite avec une preuve manquante`() {
        assertThat(ActivationInvitePolicy.shouldOpen(user(), shownToday = false, onboardingVisible = false)).isTrue()
    }

    @Test
    fun `aucune activation servie, aucune invitation`() {
        assertThat(ActivationInvitePolicy.shouldOpen(user(activation = null), false, false)).isFalse()
        assertThat(ActivationInvitePolicy.shouldOpen(null, false, false)).isFalse()
    }

    @Test
    fun `hors phase invite ou sans preuve manquante la feuille reste fermee`() {
        for (phase in listOf(UserActivation.Phase.QUIET, UserActivation.Phase.BLOCKED, UserActivation.Phase.DONE, null)) {
            assertThat(ActivationInvitePolicy.shouldOpen(user(activation(phase = phase)), false, false)).isFalse()
        }
        assertThat(ActivationInvitePolicy.shouldOpen(user(activation(missing = emptyList())), false, false)).isFalse()
    }

    @Test
    fun `deja montree aujourd'hui la feuille ne se rouvre pas`() {
        assertThat(ActivationInvitePolicy.shouldOpen(user(), shownToday = true, onboardingVisible = false)).isFalse()
    }

    @Test
    fun `jamais pendant l'onboarding`() {
        assertThat(ActivationInvitePolicy.shouldOpen(user(), shownToday = false, onboardingVisible = true)).isFalse()
    }

    @Test
    fun `ouvrir retient l'adresse et les manques sans preuve`() {
        val state = ActivationInvitePolicy.open(user())
        assertThat(state.isPresented).isTrue()
        assertThat(state.email).isEqualTo("ana@meeshy.me")
        assertThat(state.missing).containsExactly(Channel.EMAIL, Channel.PHONE)
        assertThat(state.proven).isEmpty()
        assertThat(state.isComplete).isFalse()
    }

    @Test
    fun `prouver l'adresse passe le compte a done et la retient`() {
        val state = ActivationInvitePolicy.prove(ActivationInvitePolicy.open(user()), Channel.EMAIL)
        assertThat(state.missing).containsExactly(Channel.PHONE)
        assertThat(state.proven).containsExactly(Channel.EMAIL)
        assertThat(state.activation?.phase).isEqualTo(UserActivation.Phase.DONE)
    }

    @Test
    fun `prouver un canal non manquant ne change rien`() {
        val open = ActivationInvitePolicy.open(user(activation(missing = listOf(Channel.PHONE))))
        assertThat(ActivationInvitePolicy.prove(open, Channel.EMAIL)).isEqualTo(open)
    }

    @Test
    fun `tout prouve la feuille est complete`() {
        val done = ActivationInvitePolicy.prove(
            ActivationInvitePolicy.prove(ActivationInvitePolicy.open(user()), Channel.EMAIL),
            Channel.PHONE,
        )
        assertThat(done.isComplete).isTrue()
        assertThat(done.proven).containsExactly(Channel.EMAIL, Channel.PHONE).inOrder()
    }

    @Test
    fun `absorber prend les preuves arrivees par l'utilisateur courant`() {
        val open = ActivationInvitePolicy.open(user())
        val absorbed = ActivationInvitePolicy.absorb(
            open,
            user(emailVerifiedAt = "2026-11-01T00:00:00Z", phoneVerifiedAt = "2026-11-01T00:00:00Z", phoneNumber = "+33612345678"),
        )
        assertThat(absorbed.isComplete).isTrue()
        assertThat(absorbed.proven).containsExactly(Channel.EMAIL, Channel.PHONE)
    }

    @Test
    fun `un numero verifie mais vide n'est pas une preuve`() {
        val open = ActivationInvitePolicy.open(user())
        val absorbed = ActivationInvitePolicy.absorb(open, user(phoneVerifiedAt = "2026-11-01T00:00:00Z", phoneNumber = ""))
        assertThat(absorbed.proven).isEmpty()
        assertThat(ActivationInvitePolicy.absorb(open, user(phoneVerifiedAt = "x", phoneNumber = null)).proven).isEmpty()
    }

    @Test
    fun `absorber deux fois ne duplique pas`() {
        val u = user(emailVerifiedAt = "2026-11-01T00:00:00Z")
        val once = ActivationInvitePolicy.absorb(ActivationInvitePolicy.open(user()), u)
        assertThat(ActivationInvitePolicy.absorb(once, u).proven).containsExactly(Channel.EMAIL)
    }

    @Test
    fun `l'accroche suit les jours restants`() {
        assertThat(ActivationInvitePolicy.lead(null)).isEqualTo(ActivationInvitePolicy.Lead.Open)
        assertThat(ActivationInvitePolicy.lead(0)).isEqualTo(ActivationInvitePolicy.Lead.Open)
        assertThat(ActivationInvitePolicy.lead(1)).isEqualTo(ActivationInvitePolicy.Lead.OneDay)
        assertThat(ActivationInvitePolicy.lead(12)).isEqualTo(ActivationInvitePolicy.Lead.Days(12))
    }

    @Test
    fun `le jour civil local change avec le fuseau et avec la date`() {
        val instant = 1_793_664_000_000L // 2026-11-03T00:00:00Z
        assertThat(ActivationInviteDay.key(instant, ZoneId.of("UTC"))).isEqualTo("2026-11-3")
        assertThat(ActivationInviteDay.key(instant, ZoneId.of("America/Los_Angeles"))).isEqualTo("2026-11-2")
        assertThat(ActivationInviteDay.key(instant + 86_400_000L, ZoneId.of("UTC"))).isEqualTo("2026-11-4")
    }
}
