package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.game.gestures.GameGesture
import me.meeshy.app.game.gestures.GameGestureFailure
import me.meeshy.app.game.gestures.GameGesturesUiState
import me.meeshy.sdk.model.game.progression.MeeshAction
import me.meeshy.sdk.model.game.progression.ProgressionLevelHero
import me.meeshy.sdk.model.game.progression.ProgressionMeeshDetail
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.CompositionLocalProvider
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LES TÊTES SANS BLOC DE JEU (iOS `ProgressionLevelHero`, `ProgressionMeeshDetail`, #13923) : le niveau, ses étincelles
 * et ce qui sépare du suivant ; la Meesh, son solde, ses frappées, ses bornes, et la frappe qui part par l'API — le
 * bouton reste pendant la frappe et dit qu'il travaille, le refus se lit dessous —, ou ce qu'il manque.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class HeadsWithoutGameComposeTest {

    @get:Rule val compose = createComposeRule()

    private val minting = ProgressionMeeshDetail(
        balance = 3, minted = 5, first = "2026-09-01T10:00:00Z", last = "2026-10-20T08:30:00Z", progress = 1.0,
        action = MeeshAction.Mint(cost = 1000),
    )

    @Test
    fun `the level hero says the level, the sparks and what separates from the next level`() {
        compose.setContent { MeeshyTheme { LevelHeroWithoutGame(ProgressionLevelHero(level = 2, score = 120, progress = 0.2, next = ProgressionLevelHero.Next(30, 3))) } }

        compose.onNodeWithTag(LEVEL_HERO_TAG).assertExists()
        compose.onNodeWithText("Niveau 2").assertExists()
        compose.onNodeWithText("120 étincelles").assertExists()
        compose.onNodeWithText("30 étincelles jusqu’au niveau 3").assertExists()
    }

    @Test
    fun `at the top the level hero says the scale is complete`() {
        compose.setContent { MeeshyTheme { LevelHeroWithoutGame(ProgressionLevelHero(level = 6, score = 3000, progress = 1.0, next = null)) } }

        compose.onNodeWithText("Échelle complète").assertExists()
    }

    @Test
    fun `the meesh detail says the balance, the struck ones, the bounds, and the mint leaves by the api`() {
        var mints = 0
        compose.setContent { MeeshyTheme { MeeshDetailWithoutGame(minting, GameGesturesUiState(), onMint = { mints += 1 }) } }

        compose.onNodeWithTag(MEESH_DETAIL_TAG).assertExists()
        compose.onNodeWithText("3 Meeshes").assertExists()
        compose.onNodeWithText("5 frappées depuis toujours").assertExists()
        compose.onNodeWithText("Première frappe").assertExists()
        compose.onNodeWithText("Dernière frappe").assertExists()
        compose.onNodeWithTag(MEESH_MINT_TAG).performSemanticsAction(SemanticsActions.OnClick)
        assertThat(mints).isEqualTo(1)
    }

    @Test
    fun `while minting the button stays and says it works, and a refusal reads under it once done`() {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                MeeshyTheme { MeeshDetailWithoutGame(minting, GameGesturesUiState(minting = true), onMint = {}) }
            }
        }
        compose.onNodeWithTag(MEESH_MINTING_TAG).assertExists()
        compose.onNodeWithText("Frappe en cours…", useUnmergedTree = true).assertExists()
        compose.onAllNodesWithTag(MEESH_MINT_ERROR_TAG).assertCountEquals(0)
    }

    @Test
    fun `a refused mint says why under the button`() {
        val refused = GameGesturesUiState(failures = mapOf(GameGesture.Mint to GameGestureFailure(offline = false, code = null)))
        compose.setContent { MeeshyTheme { MeeshDetailWithoutGame(minting, refused, onMint = {}) } }

        compose.onNodeWithTag(MEESH_MINT_ERROR_TAG).assertExists()
    }

    @Test
    fun `without enough sparks the detail says what is missing, and nothing struck says so`() {
        val short = ProgressionMeeshDetail(balance = 0, minted = null, first = null, last = null, progress = 0.4, action = MeeshAction.Missing(600, 120))
        compose.setContent { MeeshyTheme { MeeshDetailWithoutGame(short, GameGesturesUiState(), onMint = {}) } }

        compose.onNodeWithText("Aucune Meesh").assertExists()
        compose.onNodeWithText("Aucune frappe pour l’instant.").assertExists()
        compose.onNodeWithText(
            "600 étincelles jusqu’à ta prochaine Meesh. Toutes tes étincelles, dont 120 de conversation, se convertissent en Meesh.",
        ).assertExists()
        compose.onAllNodesWithTag(MEESH_MINT_TAG).assertCountEquals(0)
        compose.onAllNodesWithText("frappées depuis toujours", substring = true).assertCountEquals(0)
    }
}
