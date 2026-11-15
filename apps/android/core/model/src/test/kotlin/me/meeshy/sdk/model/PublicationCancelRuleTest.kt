package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PublicationCancelRuleTest {

    @Test
    fun `une publication encore en file est retiree`() {
        assertThat(PublicationCancelRule.decide(PublicationRowState.Pending)).isEqualTo(PublicationCancelOutcome.REMOVED)
    }

    @Test
    fun `une publication echouee est retiree`() {
        assertThat(PublicationCancelRule.decide(PublicationRowState.Exhausted)).isEqualTo(PublicationCancelOutcome.REMOVED)
    }

    @Test
    fun `une publication en vol demande l'annulation sans etre retiree`() {
        assertThat(PublicationCancelRule.decide(PublicationRowState.InFlight)).isEqualTo(PublicationCancelOutcome.CANCEL_REQUESTED)
    }

    @Test
    fun `une ligne disparue est deja partie`() {
        assertThat(PublicationCancelRule.decide(PublicationRowState.Absent)).isEqualTo(PublicationCancelOutcome.ALREADY_SENT)
    }

    @Test
    fun `seule la retraite est un succes et l'echec n'est jamais confondu avec elle`() {
        assertThat(PublicationCancelOutcome.entries.filter { it.removesBubble })
            .containsExactly(PublicationCancelOutcome.REMOVED)
    }

    @Test
    fun `un envoi bloque depuis plus de soixante secondes se recupere`() {
        assertThat(StuckPublicationRule.isRecoverable(PublicationRowState.Pending, waitedMillis = 61_000, hasVoice = false)).isTrue()
        assertThat(StuckPublicationRule.isRecoverable(PublicationRowState.InFlight, waitedMillis = 90_000, hasVoice = false)).isTrue()
    }

    @Test
    fun `un envoi recent, echoue, disparu ou vocal ne se recupere pas`() {
        assertThat(StuckPublicationRule.isRecoverable(PublicationRowState.Pending, waitedMillis = 60_000, hasVoice = false)).isFalse()
        assertThat(StuckPublicationRule.isRecoverable(PublicationRowState.Exhausted, waitedMillis = 120_000, hasVoice = false)).isFalse()
        assertThat(StuckPublicationRule.isRecoverable(PublicationRowState.Absent, waitedMillis = 120_000, hasVoice = false)).isFalse()
        assertThat(StuckPublicationRule.isRecoverable(PublicationRowState.Pending, waitedMillis = 120_000, hasVoice = true)).isFalse()
    }
}
