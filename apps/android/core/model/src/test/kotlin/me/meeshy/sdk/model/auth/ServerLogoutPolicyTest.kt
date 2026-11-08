package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.AttemptOutcome
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.Step
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.Verdict
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.WorkStep
import org.junit.Test

class ServerLogoutPolicyTest {

    @Test
    fun `le calendrier est 0 s, 1 s, 5 s`() {
        assertThat(ServerLogoutPolicy.ATTEMPT_DELAYS_MILLIS).containsExactly(0L, 1_000L, 5_000L).inOrder()
        assertThat(ServerLogoutPolicy.MAX_ATTEMPTS).isEqualTo(3)
    }

    @Test
    fun `un echec apres le premier essai attend 1 s, apres le deuxieme attend 5 s`() {
        assertThat(ServerLogoutPolicy.after(1, AttemptOutcome.FAILED)).isEqualTo(Step.Retry(1_000L))
        assertThat(ServerLogoutPolicy.after(2, AttemptOutcome.FAILED)).isEqualTo(Step.Retry(5_000L))
    }

    @Test
    fun `le troisieme echec passe la main a la reprise`() {
        assertThat(ServerLogoutPolicy.after(3, AttemptOutcome.FAILED)).isEqualTo(Step.HandOver)
    }

    @Test
    fun `un accuse de reception termine`() {
        assertThat(ServerLogoutPolicy.after(1, AttemptOutcome.CLOSED)).isEqualTo(Step.Finished(Verdict.CLOSED))
    }

    @Test
    fun `un 401 vaut session deja close et arrete les essais`() {
        assertThat(ServerLogoutPolicy.outcomeOf(401)).isEqualTo(AttemptOutcome.TOKEN_REFUSED)
        assertThat(ServerLogoutPolicy.after(1, AttemptOutcome.TOKEN_REFUSED))
            .isEqualTo(Step.Finished(Verdict.ALREADY_CLOSED))
    }

    @Test
    fun `les autres statuts et l'absence de statut sont des echecs a reprendre`() {
        listOf(null, 403, 429, 500, 503).forEach {
            assertThat(ServerLogoutPolicy.outcomeOf(it)).isEqualTo(AttemptOutcome.FAILED)
        }
    }

    @Test
    fun `la reprise rejoue jusqu'au plafond puis abandonne`() {
        assertThat(ServerLogoutPolicy.afterWorkRun(0, AttemptOutcome.FAILED)).isEqualTo(WorkStep.RETRY)
        assertThat(ServerLogoutPolicy.afterWorkRun(ServerLogoutPolicy.MAX_WORK_RUNS - 2, AttemptOutcome.FAILED))
            .isEqualTo(WorkStep.RETRY)
        assertThat(ServerLogoutPolicy.afterWorkRun(ServerLogoutPolicy.MAX_WORK_RUNS - 1, AttemptOutcome.FAILED))
            .isEqualTo(WorkStep.ABANDON)
    }

    @Test
    fun `la reprise s'arrete sur un accuse ou un 401`() {
        assertThat(ServerLogoutPolicy.afterWorkRun(0, AttemptOutcome.CLOSED)).isEqualTo(WorkStep.DONE)
        assertThat(ServerLogoutPolicy.afterWorkRun(3, AttemptOutcome.TOKEN_REFUSED)).isEqualTo(WorkStep.DONE)
    }
}
