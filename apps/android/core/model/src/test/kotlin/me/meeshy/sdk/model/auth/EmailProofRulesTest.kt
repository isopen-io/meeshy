package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivation
import org.junit.Test

class EmailProofRulesTest {

    private fun user(
        email: String? = "a@mail.com",
        verifiedAt: String? = null,
        activation: UserActivation? = null,
    ) = MeeshyUser(id = "u1", username = "alice", email = email, emailVerifiedAt = verifiedAt, activation = activation)

    @Test
    fun `une adresse non prouvee sans activation servie est connue non prouvee`() {
        assertThat(EmailProofRules.knownUnproven(user(), provenUserId = null)).isTrue()
    }

    @Test
    fun `une adresse prouvee, blanche ou absente ne se redemande pas`() {
        assertThat(EmailProofRules.knownUnproven(user(verifiedAt = "2026-10-01"), null)).isFalse()
        assertThat(EmailProofRules.knownUnproven(user(email = "  "), null)).isFalse()
        assertThat(EmailProofRules.knownUnproven(user(email = null), null)).isFalse()
        assertThat(EmailProofRules.knownUnproven(null, null)).isFalse()
    }

    @Test
    fun `l'activation qui ne manque pas l'adresse la dit prouvee`() {
        val phoneOnly = UserActivation(UserActivation.Phase.INVITE, null, listOf(UserActivation.Channel.PHONE))
        val emailMissing = UserActivation(UserActivation.Phase.INVITE, null, listOf(UserActivation.Channel.EMAIL))

        assertThat(EmailProofRules.knownUnproven(user(activation = phoneOnly), null)).isFalse()
        assertThat(EmailProofRules.knownUnproven(user(activation = emailMissing), null)).isTrue()
    }

    @Test
    fun `une adresse prouvee par cet appareil pour ce compte ne se redemande pas`() {
        assertThat(EmailProofRules.knownUnproven(user(), provenUserId = "u1")).isFalse()
        assertThat(EmailProofRules.knownUnproven(user(), provenUserId = "autre")).isTrue()
    }
}
