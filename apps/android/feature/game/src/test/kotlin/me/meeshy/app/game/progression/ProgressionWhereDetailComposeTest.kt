package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performSemanticsAction
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.progression.ConceptFact
import me.meeshy.sdk.model.game.progression.FicheFact
import me.meeshy.sdk.model.game.progression.FicheHead
import me.meeshy.sdk.model.game.progression.GameDetailFactKey
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionConceptFiche
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le toucher d'une ligne « Où j'en suis » ouvre les précisions de CETTE donnée (iOS `ProgressionConceptFacts` avec un
 * concept → `GameElementDetails.fact`) : la feuille dit le libellé en titre, la valeur, puis « C'est quoi » — la phrase
 * de la donnée (`game.detail.fact.<donnée>`), ou à défaut celle de son concept.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ProgressionWhereDetailComposeTest {

    @get:Rule val compose = createComposeRule()

    private val inSheet: SemanticsMatcher get() = hasAnyAncestor(hasTestTag(GAME_DETAIL_TAG))

    private fun sheetText(text: String) = compose.onNode(hasText(text) and inSheet, useUnmergedTree = true)

    private fun touch(label: String) =
        compose.onNode(hasClickAction() and hasText(label, substring = true)).performSemanticsAction(SemanticsActions.OnClick)

    private fun fiche(vararg facts: FicheFact) = ProgressionConceptFiche(FicheHead.Generic, heroLine = null, state = null, facts = facts.toList())

    private val record = FicheFact(
        GameText(GameTextKey.FactRecord),
        GameText.of(GameTextKey.Days, GameTextArg.Count(9)),
        ConceptFact.StreakRecord,
        GameDetailFactKey.StreakRecord,
    )

    @Test
    fun `touching the record of the Flame opens its own precision`() {
        compose.setContent { MeeshyTheme { ConceptWhereContent(fiche(record), concept = ProgressionConcept.Flame) } }

        touch("Au plus haut")

        sheetText("Au plus haut").assertExists()
        sheetText("9 jours").assertExists()
        sheetText("C’est ta plus longue Flamme.").assertExists()
    }

    @Test
    fun `a row without its own sentence says the sentence of its concept`() {
        val next = FicheFact(GameText(GameTextKey.FactNextRank), GameText(GameTextKey.RankAmbassadeur), ConceptFact.RankNext)
        compose.setContent { MeeshyTheme { ConceptWhereContent(fiche(next), concept = ProgressionConcept.Glory) } }

        touch("Prochain rang")

        sheetText("Prochain rang").assertExists()
        sheetText("Ta gloire te donne ton nom, et ce nom ne recule jamais.").assertExists()
    }

    @Test
    fun `without a concept the rows only read and open nothing`() {
        compose.setContent { MeeshyTheme { ConceptWhereContent(fiche(record)) } }

        compose.onAllNodesWithTag(GAME_DETAIL_TAG).assertCountEquals(0)
        compose.onNode(hasClickAction() and hasText("Au plus haut", substring = true)).assertDoesNotExist()
    }
}
