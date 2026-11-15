package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameRankCrest
import me.meeshy.sdk.model.game.GameTimeline
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.MythicSeatRef
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RankBlasonTest {

    @get:Rule
    val rule = createComposeRule()

    private fun plan(
        rank: GloryRank,
        division5: Int? = 3,
        level: Int? = 34,
        mythic: MythicSeatRef? = null,
        widthDp: Float = 200f,
    ) = RankBlasonPlan.of(rank, division5, level, mythic, widthDp)

    @Test
    fun `sous 60 dp le blason se recadre sur l'ecu et se tait sur tenants, ruban et chiffres`() {
        val compact = plan(GloryRank.Legende, widthDp = 59f)
        assertThat(compact.compact).isTrue()
        assertThat(compact.frame).isEqualTo(GameRankCrest.compactFrame)
        assertThat(compact.showsTenants).isFalse()
        assertThat(compact.showsRibbon).isFalse()
        assertThat(compact.showsLevel).isFalse()
        assertThat(compact.notches).hasSize(5)

        val full = plan(GloryRank.Legende, widthDp = 60f)
        assertThat(full.compact).isFalse()
        assertThat(full.frame).isEqualTo(GameRankCrest.fullFrame)
        assertThat(full.showsTenants).isTrue()
        assertThat(full.showsRibbon).isTrue()
        assertThat(full.showsLevel).isTrue()
    }

    @Test
    fun `le Mythe compact prend son cadre elargi pour le halo`() {
        assertThat(plan(GloryRank.Mythe, widthDp = 40f).frame).isEqualTo(GameRankCrest.compactMythicFrame)
    }

    @Test
    fun `cinq encoches par division, V en allume une et I les cinq, aucune au Mythe`() {
        (1..5).forEach { division ->
            val notches = plan(GloryRank.Voix, division5 = division).notches
            assertThat(notches).hasSize(5)
            assertThat(notches.count { it.on }).isEqualTo(6 - division)
        }
        assertThat(plan(GloryRank.Mythe, division5 = 2).notches).isEmpty()
    }

    @Test
    fun `Mee et Meo tiennent l'ecu des Ambassadeur, couronnes a Legende, aureoles au Mythe`() {
        val tenants = GloryRank.entries.associateWith { plan(it).hasTenants }
        assertThat(tenants.filterValues { it }.keys).containsExactly(
            GloryRank.Ambassadeur, GloryRank.Orateur, GloryRank.Oracle, GloryRank.Legende, GloryRank.Mythe,
        )
        assertThat(GloryRank.entries.filter { plan(it).hasCrown }).containsExactly(GloryRank.Legende)
        assertThat(GloryRank.entries.filter { plan(it).hasHalo }).containsExactly(GloryRank.Mythe)
    }

    @Test
    fun `la matiere monte avec le rang du cuivre au prisme`() {
        val materials = GloryRank.entries.map { it.material }
        assertThat(materials.first()).isEqualTo(GameMaterial.COPPER)
        assertThat(materials.last()).isEqualTo(GameMaterial.PRISM)
        assertThat(materials.map { it.ordinal }).isInOrder()
    }

    @Test
    fun `seul le Mythe porte l'emission de sa place`() {
        val seat = MythicSeatRef(number = 7, edition = 137)
        assertThat(plan(GloryRank.Mythe, mythic = seat).edition).isEqualTo(137)
        assertThat(plan(GloryRank.Legende, mythic = seat).edition).isNull()
    }

    @Test
    fun `le libelle d'acces fourni par l'hote est celui du blason`() {
        rule.setContent {
            RankBlason(
                rank = GloryRank.Voix, division5 = 2, level = 34, title = "Voix",
                modifier = Modifier.size(120.dp), accessibilityLabel = "Voix IV, niveau 34",
            )
        }
        rule.onNodeWithContentDescription("Voix IV, niveau 34").assertExists()
    }

    @Test
    fun `sans libelle le blason est decoratif`() {
        rule.setContent { RankBlason(rank = GloryRank.Echo, division5 = 4, modifier = Modifier.size(40.dp)) }
        val labelled = rule.onRoot().fetchSemanticsNode().config.contains(SemanticsProperties.ContentDescription)
        assertThat(labelled).isFalse()
    }

    @Test
    fun `un blason compact et un blason de Mythe se composent sans tenants ni erreur`() {
        rule.setContent {
            RankBlason(
                rank = GloryRank.Mythe, division5 = null, mythic = MythicSeatRef(1, 1),
                modifier = Modifier.size(48.dp), accessibilityLabel = "Mythe",
            )
        }
        rule.onNodeWithContentDescription("Mythe").assertExists()
    }

    @Test
    fun `l'ecran de montee de rang se compose au repos et sous mouvement reduit`() {
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                RankBlasonStage(
                    rank = GloryRank.Orateur, division5 = 3, play = 1, level = 55,
                    modifier = Modifier.size(160.dp), accessibilityLabel = "Orateur III, niveau 55",
                )
            }
        }
        rule.onNodeWithContentDescription("Orateur III, niveau 55").assertExists()
    }

    @Test
    fun `la timeline allume chaque trait a son instant puis pose les tenants a la fin`() {
        assertThat(RankBlasonFrame.at(null, reduceMotion = false).tenants).isTrue()
        assertThat(RankBlasonFrame.at(0.0, false).tenants).isFalse()
        assertThat(RankBlasonFrame.at(0.0, false).strokes).containsExactly(0.0, 0.0, 0.0).inOrder()
        (0..2).forEach { index ->
            val peak = RankBlasonFrame.at(RankBlasonFrame.strokePeak(index), false).strokes
            assertThat(peak[index]).isWithin(1e-9).of(1.0)
            assertThat(peak.filterIndexed { i, _ -> i != index }.all { it < 1.0 }).isTrue()
        }
        assertThat(RankBlasonFrame.at(1.1, false).tenants).isFalse()
        assertThat(RankBlasonFrame.at(1.4, false).tenants).isTrue()
        assertThat(RankBlasonFrame.at(GameTimeline.RANK_DURATION, false).rise).isEqualTo(1.0)
    }

    @Test
    fun `sous mouvement reduit l'ecu pose se fond sans monter ni graver`() {
        val half = RankBlasonFrame.at(GameTimeline.REDUCED_DURATION / 2, reduceMotion = true)
        assertThat(half.opacity).isWithin(1e-9).of(0.5)
        assertThat(half.offsetUnits).isEqualTo(0.0)
        assertThat(half.strokes).containsExactly(0.0, 0.0, 0.0).inOrder()
        assertThat(half.tenants).isTrue()
        assertThat(RankBlasonFrame.at(1.0, reduceMotion = true).opacity).isEqualTo(1.0)
    }
}
