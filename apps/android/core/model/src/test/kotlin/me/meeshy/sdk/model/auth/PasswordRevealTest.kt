package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La loi de la bascule œil (iOS `MeeshyPasswordReveal`, #8054) : masqué par défaut, un
 * geste pour afficher, un geste pour masquer. Immuable — chaque bascule rend un état neuf,
 * jamais une mutation partagée.
 */
class PasswordRevealTest {

    @Test
    fun `a password is masked until the user asks to see it`() {
        assertThat(PasswordReveal().isRevealed).isFalse()
    }

    @Test
    fun `toggling once reveals and toggling twice masks again`() {
        val revealed = PasswordReveal().toggled()
        val masked = revealed.toggled()

        assertThat(revealed.isRevealed).isTrue()
        assertThat(masked.isRevealed).isFalse()
    }

    @Test
    fun `toggling leaves the previous state untouched`() {
        val original = PasswordReveal()

        original.toggled()

        assertThat(original.isRevealed).isFalse()
    }

    @Test
    fun `the action offered is the opposite of the current state`() {
        assertThat(PasswordReveal().action).isEqualTo(PasswordRevealAction.SHOW)
        assertThat(PasswordReveal().toggled().action).isEqualTo(PasswordRevealAction.HIDE)
    }

    @Test
    fun `the announced state names what is on screen, not what the button will do`() {
        assertThat(PasswordReveal().state).isEqualTo(PasswordRevealState.MASKED)
        assertThat(PasswordReveal().toggled().state).isEqualTo(PasswordRevealState.REVEALED)
    }
}
