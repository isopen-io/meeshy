package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Ce qu'un écran remet à la connexion avant qu'elle n'existe (iOS `LoginEmailHandoff`,
 * `LoginAccountHandoff`) : en mémoire vive, à usage unique, la dernière écriture gagne.
 */
class LoginHandoffTest {

    @Test
    fun `an empty slot gives nothing`() {
        assertThat(LoginHandoffSlot<String>().take()).isNull()
    }

    @Test
    fun `reading a held value empties the slot`() {
        val slot = LoginHandoffSlot<String>().apply { hold("ada@meeshy.me") }

        assertThat(slot.take()).isEqualTo("ada@meeshy.me")
        assertThat(slot.take()).isNull()
    }

    @Test
    fun `the last write wins`() {
        val slot = LoginHandoffSlot<LoginAccountIntent>().apply {
            hold(LoginAccountIntent.AddAccount)
            hold(LoginAccountIntent.Account("u1"))
        }

        assertThat(slot.take()).isEqualTo(LoginAccountIntent.Account("u1"))
    }

    @Test
    fun `holding null clears what was held`() {
        val slot = LoginHandoffSlot<String>().apply {
            hold("x")
            hold(null)
        }

        assertThat(slot.take()).isNull()
    }

    @Test
    fun `a valid address typed as the identifier is offered to the recovery screens trimmed`() {
        assertThat(LoginEmailCandidate.from("  ada@meeshy.me ")).isEqualTo("ada@meeshy.me")
    }

    @Test
    fun `a plain username is not an address`() {
        assertThat(LoginEmailCandidate.from("ada")).isEmpty()
        assertThat(LoginEmailCandidate.from("ada@meeshy")).isEmpty()
        assertThat(LoginEmailCandidate.from("")).isEmpty()
    }
}
