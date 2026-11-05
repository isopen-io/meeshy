package me.meeshy.app.game

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.element.GameElementDetail
import me.meeshy.sdk.model.game.element.GameElementEmblem
import me.meeshy.sdk.model.game.element.GameElementKind
import me.meeshy.sdk.model.game.element.GameElementStatus
import me.meeshy.sdk.model.game.progression.PieceDetailFact
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Toucher un élément du jeu ouvre SA feuille (iOS `GameElementSheet`) : le nom d'abord — le focus d'accessibilité s'y
 * pose après 350 ms —, l'état, ce que c'est, comment l'obtenir, les données, et « Voir la fiche » par rappel.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameElementSheetTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun flame() = GameElementDetail(
        kind = GameElementKind.FlameForm,
        key = "flamme",
        emblem = GameElementEmblem.Flame(FlameFormKey.Flamme),
        name = GameCopyLaws.flameFormName(FlameFormKey.Flamme),
        status = GameElementStatus.Value(GameCopyLaws.days(8), null),
        facts = listOf(PieceDetailFact(GameText(GameTextKey.FactBonus), GameText.of(GameTextKey.FactPercent, me.meeshy.sdk.model.game.GameTextArg.Count(16)))),
        concept = ProgressionConcept.Flame,
    )

    private fun show(opened: MutableList<ProgressionConcept> = mutableListOf(), content: @Composable () -> Unit = {}) = compose.setContent {
        MeeshyTheme {
            GameElementHost(onOpenConcept = { opened += it }) {
                Box(Modifier.testTag(ELEMENT).gameElement(flame())) { Text("flame") }
                content()
            }
        }
    }

    private val inSheet: SemanticsMatcher get() = hasAnyAncestor(hasTestTag(GAME_ELEMENT_SHEET_TAG))

    private fun touch() = compose.onNodeWithTag(ELEMENT).performSemanticsAction(SemanticsActions.OnClick)

    @Test
    fun `l element ne montre aucune feuille avant le toucher puis l ouvre avec ses precisions`() {
        show()
        compose.onAllNodesWithTag(GAME_ELEMENT_SHEET_TAG).assertCountEquals(0)

        touch()
        compose.waitForIdle()

        compose.onNodeWithTag(GAME_ELEMENT_NAME_TAG).assertExists()
        compose.onNode(hasText(context.getString(R.string.game_detail_flame_what)) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText(context.getString(R.string.game_detail_gives_label), ignoreCase = true) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText(context.getString(R.string.game_detail_flame_how)) and inSheet, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `le focus d accessibilite se pose sur le nom une fois la feuille posee`() {
        show()
        touch()

        compose.mainClock.advanceTimeBy(NAME_FOCUS_DELAY_MILLIS + 150)
        compose.waitForIdle()

        compose.onNodeWithTag(GAME_ELEMENT_NAME_TAG).assertIsFocused()
    }

    @Test
    fun `voir la fiche ferme la feuille puis rend le concept de l element au rappel`() {
        val opened = mutableListOf<ProgressionConcept>()
        show(opened)
        touch()
        compose.waitForIdle()

        compose.onNode(hasClickAction() and hasText(context.getString(R.string.game_detail_see_fiche)) and inSheet)
            .performSemanticsAction(SemanticsActions.OnClick)
        compose.waitUntil(timeoutMillis = 5_000) { opened.isNotEmpty() }

        assertThat(opened).containsExactly(ProgressionConcept.Flame)
        compose.onAllNodesWithTag(GAME_ELEMENT_SHEET_TAG).assertCountEquals(0)
    }

    @Test
    fun `sans hote l element reste inerte`() {
        compose.setContent { MeeshyTheme { Box(Modifier.testTag(ELEMENT).gameElement(flame())) { Text("flame") } } }

        compose.onNodeWithTag(ELEMENT).assertExists()
        compose.onAllNodesWithTag(GAME_ELEMENT_SHEET_TAG).assertCountEquals(0)
    }

    private companion object {
        const val ELEMENT = "game.element.test"
    }
}
