package me.meeshy.sdk.model.account

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Spec de [SessionPurgeDecision] et de [LocalStoreTarget] : la purge de la base
 * locale n'a lieu qu'à une fin de session CONSTATÉE, jamais pendant l'initialisation.
 *
 * Le défaut visé est une course d'abonnement : l'état d'authentification naît
 * `false`, la restauration de la session est asynchrone, et un `StateFlow` rejoue sa
 * valeur courante à tout nouvel abonné. Un collecteur qui purgeait sur « non
 * authentifié » effaçait la base à chaque démarrage à froid d'une session valide.
 *
 * Miroir : iOS `SessionPurgeDecision` et `MessageStoreTarget`
 * (`apps/ios/Meeshy/Core/SessionPurgeDecision.swift`).
 */
class SessionPurgeDecisionTest {

    private val account = AccountStorageKey.of(userId = "a1", serverOrigin = "https://gate.meeshy.me")!!

    private fun purge(sessionResolved: Boolean, isAuthenticated: Boolean) =
        SessionPurgeDecision.shouldPurgeLocalMessages(
            sessionResolved = sessionResolved,
            isAuthenticated = isAuthenticated,
        )

    @Test
    fun `un demarrage a froid non resolu ne purge rien`() {
        assertThat(purge(sessionResolved = false, isAuthenticated = false)).isFalse()
    }

    @Test
    fun `une session valide restauree ne purge rien`() {
        assertThat(purge(sessionResolved = true, isAuthenticated = true)).isFalse()
    }

    @Test
    fun `un compte authentifie avant la resolution ne purge rien`() {
        assertThat(purge(sessionResolved = false, isAuthenticated = true)).isFalse()
    }

    @Test
    fun `une fin de session constatee purge`() {
        assertThat(purge(sessionResolved = true, isAuthenticated = false)).isTrue()
    }

    @Test
    fun `la purge n'arrive qu'au dernier pas d'un demarrage suivi d'une deconnexion`() {
        val observed = listOf(
            false to false,
            false to true,
            true to true,
            true to false,
        ).map { (resolved, authenticated) -> purge(sessionResolved = resolved, isAuthenticated = authenticated) }

        assertThat(observed).containsExactly(false, false, false, true).inOrder()
    }

    @Test
    fun `la base lue reste inchangee tant que personne n'a regarde`() {
        assertThat(target(sessionResolved = false, isAuthenticated = false, active = null))
            .isEqualTo(LocalStoreTarget.Unchanged)
        assertThat(target(sessionResolved = false, isAuthenticated = false, active = account))
            .isEqualTo(LocalStoreTarget.Unchanged)
    }

    @Test
    fun `la base lue est celle du compte actif des qu'il est authentifie`() {
        assertThat(target(sessionResolved = false, isAuthenticated = true, active = account))
            .isEqualTo(LocalStoreTarget.Account(account))
        assertThat(target(sessionResolved = true, isAuthenticated = true, active = account))
            .isEqualTo(LocalStoreTarget.Account(account))
    }

    @Test
    fun `un authentifie sans compte nommable ne lit la base de personne`() {
        assertThat(target(sessionResolved = true, isAuthenticated = true, active = null))
            .isEqualTo(LocalStoreTarget.Nobody)
    }

    @Test
    fun `une fin de session constatee ne lit la base de personne`() {
        assertThat(target(sessionResolved = true, isAuthenticated = false, active = account))
            .isEqualTo(LocalStoreTarget.Nobody)
    }

    @Test
    fun `la purge et la base lue disent la meme chose sur les quatre combinaisons`() {
        val combinations = listOf(false to false, false to true, true to true, true to false)

        combinations.forEach { (resolved, authenticated) ->
            val purges = purge(sessionResolved = resolved, isAuthenticated = authenticated)
            val reads = target(sessionResolved = resolved, isAuthenticated = authenticated, active = account)

            assertThat(purges).isEqualTo(reads == LocalStoreTarget.Nobody)
        }
    }

    private fun target(sessionResolved: Boolean, isAuthenticated: Boolean, active: AccountStorageKey?) =
        LocalStoreTarget.resolve(
            sessionResolved = sessionResolved,
            isAuthenticated = isAuthenticated,
            activeKey = active,
        )
}
