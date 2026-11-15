package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Les états du bouton d'action d'authentification (iOS `AuthActionButton` +
 * `LoginView.loginButton`) : un bouton bloqué par son hôte SE VOIT bloqué (opacité 0,6) et
 * ignore le toucher ; un envoi en cours garde sa couleur de marque — l'action est LANCÉE,
 * pas refusée — montre un indicateur, et ignore aussi le toucher.
 */
class AuthActionButtonStateTest {

    @Test
    fun `an enabled idle button takes taps at full strength and shows its label`() {
        val state = AuthActionButtonState.resolve(enabled = true, loading = false)

        assertThat(state.acceptsTaps).isTrue()
        assertThat(state.showsSpinner).isFalse()
        assertThat(state.restingAlpha).isEqualTo(1f)
    }

    @Test
    fun `a disabled button ignores taps and dims to sixty percent`() {
        val state = AuthActionButtonState.resolve(enabled = false, loading = false)

        assertThat(state.acceptsTaps).isFalse()
        assertThat(state.showsSpinner).isFalse()
        assertThat(state.restingAlpha).isEqualTo(AuthActionButtonState.DISABLED_ALPHA)
        assertThat(AuthActionButtonState.DISABLED_ALPHA).isEqualTo(0.6f)
    }

    @Test
    fun `a loading button shows the spinner, ignores taps and keeps the brand strength`() {
        val state = AuthActionButtonState.resolve(enabled = true, loading = true)

        assertThat(state.acceptsTaps).isFalse()
        assertThat(state.showsSpinner).isTrue()
        assertThat(state.restingAlpha).isEqualTo(1f)
    }

    @Test
    fun `a disabled button that is also loading still shows the spinner and stays dimmed`() {
        val state = AuthActionButtonState.resolve(enabled = false, loading = true)

        assertThat(state.acceptsTaps).isFalse()
        assertThat(state.showsSpinner).isTrue()
        assertThat(state.restingAlpha).isEqualTo(AuthActionButtonState.DISABLED_ALPHA)
    }
}
