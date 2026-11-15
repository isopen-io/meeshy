package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LA PIÈCE DES ÉLANS en tête de leur fiche (iOS `ProgressionElansHero`) : son titre, ses familles actives — chacune
 * touchable, qui ouvre ses précisions —, puis la phrase qui dit ce qui porte l'élan.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ElansPieceComposeTest {

    @get:Rule val compose = createComposeRule()

    private val inSheet: SemanticsMatcher get() = hasAnyAncestor(hasTestTag(GAME_DETAIL_TAG))

    private fun elan(factor: Double, families: List<EngagementAxisFamily>) = EngagementElanProgress(
        factor = factor, activeFamilyCount = families.size, hasStanding = true, windowDays = 7,
        isAccelerated = factor > 1.0, activeFamilies = families,
    )

    @Test
    fun `an accelerated momentum shows its factor, its families and what carries it`() {
        compose.setContent { MeeshyTheme { ElansPiece(elan(2.0, listOf(EngagementAxisFamily.CONTENT, EngagementAxisFamily.SOCIAL))) } }

        compose.onNodeWithText("Élan ×2").assertExists()
        compose.onNodeWithText("Contenu produit").assertExists()
        compose.onNodeWithText("Liens tissés").assertExists()
        compose.onNodeWithText("Élan ×2 — 2 familles actives sur 7 jours, plus ton assise. Tes prochains gestes rapportent 2 fois plus.")
            .assertExists()
    }

    @Test
    fun `without momentum the piece invites to hold several families`() {
        compose.setContent { MeeshyTheme { ElansPiece(null) } }

        compose.onNodeWithText("Tes élans").assertExists()
        compose.onNodeWithText("chaque famille tenue en même temps", substring = true).assertExists()
    }

    @Test
    fun `touching a family opens its precisions`() {
        compose.setContent { MeeshyTheme { ElansPiece(elan(2.0, listOf(EngagementAxisFamily.CONVERSATION))) } }

        compose.onNode(hasClickAction() and hasText("Conversations")).performSemanticsAction(SemanticsActions.OnClick)

        compose.onNode(hasText("Conversations") and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("Active ces jours-ci") and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("Une famille regroupe des gestes qui se ressemblent.") and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("7 jours") and inSheet, useUnmergedTree = true).assertExists()
    }
}
