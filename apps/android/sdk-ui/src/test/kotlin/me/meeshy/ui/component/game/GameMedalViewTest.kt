package me.meeshy.ui.component.game

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameMedalViewTest {

    @get:Rule
    val rule = createComposeRule()

    private fun plan(material: GameMaterial, state: GameMedalState = GameMedalState.Lit, label: String? = "100") =
        GameMedalPlan.of(material, state, label)

    @Test
    fun `autant de perles allumees que le rang de la matiere`() {
        val lit = listOf(
            GameMaterial.COPPER, GameMaterial.BRONZE, GameMaterial.SILVER, GameMaterial.GOLD,
            GameMaterial.PLATINUM, GameMaterial.OBSIDIAN, GameMaterial.PRISM,
        ).map { plan(it).litPearls }
        assertThat(lit).containsExactly(1, 2, 3, 4, 5, 6, 7).inOrder()
    }

    @Test
    fun `le ruban et son cartouche commencent a l'or`() {
        assertThat(plan(GameMaterial.SILVER).ribbon).isFalse()
        assertThat(plan(GameMaterial.SILVER).cartouche).isNull()
        assertThat(plan(GameMaterial.GOLD).ribbon).isTrue()
        assertThat(plan(GameMaterial.GOLD).cartouche).isEqualTo("100")
        assertThat(plan(GameMaterial.PRISM).ribbon).isTrue()
    }

    @Test
    fun `une empreinte n'a ni metal ni perle ni ruban mais dit ce qu'il manque`() {
        val imprint = plan(GameMaterial.GOLD, GameMedalState.Imprint, "−37")
        assertThat(imprint.metal).isFalse()
        assertThat(imprint.litPearls).isEqualTo(0)
        assertThat(imprint.ribbon).isFalse()
        assertThat(imprint.cartouche).isNull()
        assertThat(imprint.imprintLabel).isEqualTo("−37")
    }

    @Test
    fun `seul le prisme irise son email`() {
        assertThat(plan(GameMaterial.PRISM).iridescent).isTrue()
        assertThat(plan(GameMaterial.OBSIDIAN).iridescent).isFalse()
        assertThat(plan(GameMaterial.PRISM, GameMedalState.Imprint).iridescent).isFalse()
    }

    @Test
    fun `la flamme n'est pas une matiere de medaille`() {
        assertThat(plan(GameMaterial.FLAME).litPearls).isEqualTo(0)
    }

    @Test
    fun `la medaille libelle par l'hote est un element image unique`() {
        rule.setContent {
            Box(Modifier.size(100.dp)) {
                GameMedalView(
                    family = GameMedalFamily.CONTENT, glyph = GameMedalGlyph.TEXT_MESSAGE, material = GameMaterial.GOLD,
                    label = "100", progress = 0.4, accessibilityLabel = "Messages texte, Or, 200 sur 500 vers Platine",
                )
            }
        }
        val node = rule.onNodeWithContentDescription("Messages texte, Or, 200 sur 500 vers Platine")
        node.assertExists()
        assertThat(node.fetchSemanticsNode().config[SemanticsProperties.Role]).isEqualTo(Role.Image)
    }

    @Test
    fun `chaque glyphe et chaque forme se dessinent sans exception`() {
        rule.setContent {
            Box(Modifier.size(100.dp)) {
                GameMedalGlyph.entries.forEach {
                    GameMedalView(GameMedalFamily.TOOL, it, GameMaterial.PRISM, prismTilt = 0.2, label = "5000")
                    GameMedalView(GameMedalFamily.TOOL, it, GameMaterial.COPPER, state = GameMedalState.Imprint, label = "−37")
                }
                GameBadgeView(GameMaterial.GOLD, label = "100")
                GameBadgeView(GameMaterial.GOLD, shape = GameBadgeShape.Record, label = "9")
                GameBadgeView(GameMaterial.GOLD, shape = GameBadgeShape.Collection(2, 5))
                GameBadgeView(GameMaterial.GOLD, state = GameBadgeState.Imprint, label = "−3")
            }
        }
        rule.waitForIdle()
    }
}
