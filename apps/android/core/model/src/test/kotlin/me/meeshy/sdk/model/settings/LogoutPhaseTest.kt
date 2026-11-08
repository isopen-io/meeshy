package me.meeshy.sdk.model.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LogoutPhaseTest {

    @Test
    fun `la deconnexion suit Idle puis Confirming puis InProgress puis Done`() {
        val phases = listOf(
            LogoutPhase.Idle,
            LogoutPhase.Idle.requested(),
            LogoutPhase.Idle.requested().confirmed(),
            LogoutPhase.Idle.requested().confirmed().finished(),
        )
        assertThat(phases).containsExactly(
            LogoutPhase.Idle,
            LogoutPhase.Confirming,
            LogoutPhase.InProgress,
            LogoutPhase.Done,
        ).inOrder()
    }

    @Test
    fun `annuler depuis Confirming revient a Idle sans rien changer d'autre`() {
        assertThat(LogoutPhase.Confirming.cancelled()).isEqualTo(LogoutPhase.Idle)
    }

    @Test
    fun `confirmer hors Confirming est ignore`() {
        assertThat(LogoutPhase.Idle.confirmed()).isEqualTo(LogoutPhase.Idle)
        assertThat(LogoutPhase.InProgress.confirmed()).isEqualTo(LogoutPhase.InProgress)
        assertThat(LogoutPhase.Done.confirmed()).isEqualTo(LogoutPhase.Done)
    }

    @Test
    fun `annuler pendant la fermeture de session est ignore`() {
        assertThat(LogoutPhase.InProgress.cancelled()).isEqualTo(LogoutPhase.InProgress)
    }

    @Test
    fun `demander la deconnexion pendant qu'elle court est ignore`() {
        assertThat(LogoutPhase.InProgress.requested()).isEqualTo(LogoutPhase.InProgress)
        assertThat(LogoutPhase.Done.requested()).isEqualTo(LogoutPhase.Done)
    }

    @Test
    fun `seul InProgress bloque les interactions`() {
        assertThat(LogoutPhase.entries.filter { it.blocksInteraction }).containsExactly(LogoutPhase.InProgress)
    }

    @Test
    fun `terminer hors InProgress est ignore`() {
        assertThat(LogoutPhase.Confirming.finished()).isEqualTo(LogoutPhase.Confirming)
    }
}
