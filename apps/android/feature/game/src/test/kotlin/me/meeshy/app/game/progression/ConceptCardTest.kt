package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.test.core.app.ApplicationProvider
import me.meeshy.app.game.gameString
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.progression.ConceptFact
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionConceptCard
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConceptCardTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private val value = GameText.of(GameTextKey.RankGlory, GameTextArg.Verbatim("1 800"))
    private val line = GameText.of(GameTextKey.StreakRecord, GameTextArg.Count(12))

    private fun card(urgent: Boolean) = ProgressionConceptCard(
        concept = ProgressionConcept.Flame,
        value = value,
        valueFact = ConceptFact.Streak,
        emblemLevel = null,
        line = line,
        urgent = urgent,
        gauge = null,
    )

    private var spoken = ""

    private fun show(card: ProgressionConceptCard, onOpen: () -> Unit = {}) =
        compose.setContent {
            MeeshyTheme {
                spoken = listOf(gameString(value), gameString(line)).joinToString(", ")
                ProgressionConceptCardView(card, game = null, onOpen = onOpen)
            }
        }

    @Test
    fun `la carte est un seul element dont le libelle dit le nom la valeur et la ligne`() {
        show(card(urgent = false))

        val description = spoken
        compose.onNode(
            SemanticsMatcher("libellé fusionné") {
                it.config.getOrNull(SemanticsProperties.ContentDescription)?.firstOrNull()?.endsWith(description) == true
            },
        ).assertIsDisplayed()
    }

    @Test
    fun `un toucher sur la carte ouvre la fiche`() {
        var opened = 0
        show(card(urgent = false)) { opened++ }

        compose.onNode(hasClickAction()).assertHasClickAction().performClick()

        compose.runOnIdle { check(opened == 1) { "la carte n'a pas ouvert la fiche" } }
    }

    @Test
    fun `le point d attention n apparait que quand la ligne est urgente`() {
        show(card(urgent = true))
        compose.onNodeWithTag(URGENT_DOT_TAG, useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `sans urgence aucun point d attention`() {
        show(card(urgent = false))
        compose.onNodeWithTag(URGENT_DOT_TAG, useUnmergedTree = true).assertDoesNotExist()
    }
}
