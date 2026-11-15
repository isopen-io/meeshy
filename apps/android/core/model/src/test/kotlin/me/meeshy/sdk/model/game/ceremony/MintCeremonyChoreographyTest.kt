package me.meeshy.sdk.model.game.ceremony

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.MeeshEdition
import org.junit.Test

class MintCeremonyChoreographyTest {

    private fun plan(edition: MeeshEdition, mode: MintCeremonyMode = MintCeremonyMode.Normal, answeredAtMs: Double? = null) =
        GameMintCeremony.plan(edition = edition, mode = mode, answeredAtMs = answeredAtMs)

    @Test
    fun `le marteau est en bas a l impact et se releve ensuite`() {
        val silver = plan(MeeshEdition.Silver)
        val impact = silver.strikes[0].impactMs / 1000.0
        val atImpact = MintCeremonyChoreography.frame(silver, impact).hammerMeo.angle
        val raised = MintCeremonyChoreography.frame(silver, silver.strikes[0].atMs / 1000.0 - 0.3).hammerMeo.angle
        assertThat(atImpact).isNotEqualTo(raised)
        assertThat(MintCeremonyChoreography.frame(silver, impact + 0.45).hammerMeo.opacity).isWithin(1e-9).of(1.0)
        assertThat(MintCeremonyChoreography.frame(silver, impact + 0.6).hammerMeo.opacity).isLessThan(1.0)
    }

    @Test
    fun `la secousse n existe qu au moment du coup`() {
        val silver = plan(MeeshEdition.Silver)
        val impact = silver.strikes[0].impactMs / 1000.0
        assertThat(MintCeremonyChoreography.frame(silver, impact + 0.02).shake).isNotEqualTo(StagePoint.ZERO)
        assertThat(MintCeremonyChoreography.frame(silver, 1.0).shake).isEqualTo(StagePoint.ZERO)
    }

    @Test
    fun `au refus le temps remonte avant le depart des etincelles et aucun coup ne tombe`() {
        val refused = plan(MeeshEdition.Gold, MintCeremonyMode.Refused, answeredAtMs = 2600.0)
        val end = refused.refusal!!.rewind.toMs / 1000.0 + 0.1
        assertThat(refused.sceneTime(end)).isLessThan(refused.span(MintCeremonyPhase.Emit)!!.fromMs / 1000.0)
        assertThat(refused.strikes).isEmpty()
    }
}
