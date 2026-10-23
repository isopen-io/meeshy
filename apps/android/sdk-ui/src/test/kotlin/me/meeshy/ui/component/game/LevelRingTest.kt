package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.LevelTierKey
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LevelRingTest {

    @get:Rule
    val rule = createComposeRule()

    @Test
    fun `l'arc balaie la fraction de la barre et rien au dela du tour`() {
        assertThat(LevelRingGeometry.sweepDegrees(0f)).isEqualTo(0f)
        assertThat(LevelRingGeometry.sweepDegrees(0.25f)).isEqualTo(90f)
        assertThat(LevelRingGeometry.sweepDegrees(1.7f)).isEqualTo(360f)
        assertThat(LevelRingGeometry.sweepDegrees(-1f)).isEqualTo(0f)
    }

    @Test
    fun `le repere de record part de midi dans le sens horaire entre les rayons 20 et 28`() {
        val (from, to) = LevelRingGeometry.tick(0f)
        assertThat(from.x).isWithin(0.001f).of(28f)
        assertThat(from.y).isWithin(0.001f).of(8f)
        assertThat(to.y).isWithin(0.001f).of(0f)
        val (quarterFrom, quarterTo) = LevelRingGeometry.tick(0.25f)
        assertThat(quarterFrom.x).isWithin(0.001f).of(48f)
        assertThat(quarterTo.x).isWithin(0.001f).of(56f)
    }

    @Test
    fun `les etoiles de prestige sont centrees sous l'anneau et plafonnees a cinq`() {
        assertThat(LevelRingGeometry.starCenters(0)).isEmpty()
        assertThat(LevelRingGeometry.starCenters(1)).containsExactly(Offset(28f, 61f))
        assertThat(LevelRingGeometry.starCenters(9)).hasSize(5)
        assertThat(LevelRingGeometry.starCenters(5).map { it.x }).containsExactly(10f, 19f, 28f, 37f, 46f).inOrder()
    }

    @Test
    fun `la boite grandit de 56 a 66 avec le prestige`() {
        assertThat(LevelRingGeometry.aspect(0)).isEqualTo(1f)
        assertThat(LevelRingGeometry.aspect(2)).isWithin(0.0001f).of(56f / 66f)
    }

    @Test
    fun `le cartouche s'elargit avec les chiffres romains`() {
        assertThat(LevelRingGeometry.cartoucheWidth("I")).isWithin(0.001f).of(10.4f)
        assertThat(LevelRingGeometry.cartoucheWidth("XVIII")).isWithin(0.001f).of(28f)
    }

    @Test
    fun `le corps du chiffre suit le nombre de chiffres de 1 a 5`() {
        assertThat(listOf(1, 34, 99).map { levelTypeSize(it) }).containsExactly(14f, 14f, 14f)
        assertThat(levelTypeSize(100)).isEqualTo(11f)
        assertThat(levelTypeSize(999)).isEqualTo(11f)
        assertThat(levelTypeSize(1000)).isEqualTo(9f)
        assertThat(levelTypeSize(9999)).isEqualTo(9f)
        assertThat(levelTypeSize(10000)).isEqualTo(7.5f)
        assertThat(levelTypeSize(-5)).isEqualTo(14f)
    }

    @Test
    fun `l'anneau libelle par l'hote est un element image unique`() {
        rule.setContent {
            Box(Modifier.size(112.dp)) {
                LevelRing(level = 34, progress = 0.6f, tier = LevelTierKey.Eclat, accessibilityLabel = "Niveau 34, palier Éclat, quatrième palier")
            }
        }
        val node = rule.onNodeWithContentDescription("Niveau 34, palier Éclat, quatrième palier")
        node.assertExists()
        assertThat(node.fetchSemanticsNode().config[SemanticsProperties.Role]).isEqualTo(Role.Image)
    }

    @Test
    fun `chaque palier se dessine avec prestige et repere sans exception`() {
        rule.setContent {
            Box(Modifier.size(112.dp)) {
                LevelTierKey.entries.forEach {
                    LevelRing(level = 12345, progress = 0.5f, tier = it, prestige = 5, recordMarker = 0.8f)
                    TierEmblemView(it)
                }
            }
        }
        rule.waitForIdle()
    }
}
