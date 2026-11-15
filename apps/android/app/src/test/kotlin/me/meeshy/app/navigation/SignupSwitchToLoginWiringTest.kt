package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #18265 — « Se connecter » depuis l'inscription remet l'adresse tapée à la connexion. L'écran de connexion est déjà
 * composé SOUS l'accueil et SOUS la feuille d'inscription : son adoption d'arrivée (`LaunchedEffect(Unit)`) a déjà
 * tourné et ne rejoue pas quand ce qui le couvre s'en va. L'hôte qui ferme l'inscription fait donc adopter la remise
 * lui-même, sinon l'adresse reste dans la file et le champ reste vide.
 */
class SignupSwitchToLoginWiringTest {

    private fun source(path: String) = File("src/main/kotlin/me/meeshy/app/navigation/$path").readText()

    private fun signInOfSignup(host: String): String =
        host.substringAfter("SignupScreen(").substringAfter("onSignIn = ").substringBefore("\n")

    @Test
    fun `depuis l accueil, Se connecter de l inscription solde l accueil et fait adopter l adresse a la connexion`() {
        val signIn = signInOfSignup(source("auth/WelcomeDestination.kt"))

        assertThat(signIn).contains("authViewModel.adoptPendingHandoffs()")
        assertThat(signIn).contains("WelcomeUiEvent.SignInTapped")
    }

    @Test
    fun `depuis la connexion, Se connecter de l inscription referme la feuille et fait adopter l adresse a la connexion`() {
        val signIn = signInOfSignup(source("graph/AuthNavGraph.kt"))

        assertThat(signIn).contains("authViewModel.adoptPendingHandoffs()")
        assertThat(signIn).contains("dismiss()")
    }
}
