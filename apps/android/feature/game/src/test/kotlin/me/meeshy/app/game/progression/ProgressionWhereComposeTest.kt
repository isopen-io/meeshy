package me.meeshy.app.game.progression

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.progression.ConceptFact
import me.meeshy.sdk.model.game.progression.FicheFact
import me.meeshy.sdk.model.game.progression.FicheHead
import me.meeshy.sdk.model.game.progression.FicheStateLine
import me.meeshy.sdk.model.game.progression.ProgressionConceptFiche
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * « Où j'en suis » sur la fiche (iOS `ProgressionConceptContent` + `ProgressionConceptFacts`) : la phrase d'état en
 * clair, puis chaque ligne « libellé → valeur » que la loi a gardée, habillée dans la langue de l'interface.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ProgressionWhereComposeTest {

    @get:Rule val compose = createComposeRule()

    @Test
    fun `une Flamme eteinte dit sa phrase puis son record`() {
        val fiche = ProgressionConceptFiche(
            head = FicheHead.Generic,
            heroLine = null,
            state = FicheStateLine(GameText(GameTextKey.StateFlameOut), ConceptFact.FlameState),
            facts = listOf(
                FicheFact(GameText(GameTextKey.FactRecord), GameText.of(GameTextKey.Days, GameTextArg.Count(9)), ConceptFact.StreakRecord),
            ),
        )
        compose.setContent { MeeshyTheme { ConceptWhereContent(fiche) } }

        compose.onNodeWithTag(WHERE_STATE_TAG).assertTextEquals("Ta Flamme est éteinte. Un geste en allume une nouvelle.")
        compose.onNodeWithText("Au plus haut").assertExists()
        compose.onNodeWithText("9 jours").assertExists()
    }

    @Test
    fun `sans phrase la gloire dit le prochain rang et ce qu il manque`() {
        val fiche = ProgressionConceptFiche(
            head = FicheHead.Generic,
            heroLine = null,
            state = null,
            facts = listOf(
                FicheFact(GameText(GameTextKey.FactNextRank), GameText(GameTextKey.RankAmbassadeur), ConceptFact.RankNext),
                FicheFact(
                    GameText.of(GameTextKey.FactMissingForRank, GameTextArg.Nested(GameText(GameTextKey.RankAmbassadeur))),
                    GameText.of(GameTextKey.RankGlory, GameTextArg.Count(12)),
                    ConceptFact.GloryMissing,
                ),
            ),
        )
        compose.setContent { MeeshyTheme { ConceptWhereContent(fiche) } }

        compose.onNodeWithTag(WHERE_STATE_TAG).assertDoesNotExist()
        compose.onNodeWithText("Prochain rang").assertExists()
        compose.onNodeWithText("12 de gloire").assertExists()
        compose.onNodeWithText("Jusqu’à", substring = true).assertExists()
    }
}
