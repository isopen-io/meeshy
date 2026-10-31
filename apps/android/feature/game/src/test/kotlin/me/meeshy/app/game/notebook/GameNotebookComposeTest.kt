package me.meeshy.app.game.notebook

import android.content.Context
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import me.meeshy.app.game.progression.ProgressionDoors
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.NotebookEntry
import me.meeshy.sdk.model.game.photo.NotebookStatus
import me.meeshy.sdk.model.game.photo.PhotoMode
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La Chronique (iOS `GameNotebookPage`) : son état vide, son squelette à froid, ses étapes à rattraper (la première de
 * chaque piste ouverte, les suivantes estompées qui disent laquelle prendre d'abord), la place de ses photos ; et la
 * porte « La Chronique » de la première page, au-dessus de « Comment ça marche ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameNotebookComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `vide la chronique dit qu elle attend sa premiere page et ou vivent les photos`() {
        compose.setContent { MeeshyTheme { GameNotebookContent(GameNotebookUiState.ready(standing = null)) } }

        compose.onNodeWithText(context.getString(R.string.game_notebook_empty)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_notebook_device_only)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_notebook_catch_up)).assertDoesNotExist()
    }

    @Test
    fun `a froid le squelette paraît sans etat vide`() {
        compose.setContent { MeeshyTheme { GameNotebookContent(GameNotebookUiState()) } }

        compose.onNodeWithTag(NOTEBOOK_SKELETON_TAG).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_notebook_empty)).assertDoesNotExist()
    }

    @Test
    fun `les etapes a rattraper se lisent et une etape verrouillee dit laquelle prendre d abord`() {
        val state = GameNotebookUiState.ready(PhotoCatchUpStanding(rank = GloryRank.Murmure, division = 4, minted = 12))
        compose.setContent { MeeshyTheme { GameNotebookContent(state) } }

        val first = context.getString(R.string.game_photo_title_meesh_first)
        compose.onNodeWithText(context.getString(R.string.game_notebook_catch_up)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_photo_title_start)).assertExists()
        compose.onNodeWithText(first).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_photo_title_meesh_number, "10")).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_notebook_catch_up_locked, first)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_notebook_empty)).assertDoesNotExist()
    }

    @Test
    fun `la chronique s ouvre depuis la premiere page`() {
        var notebook = 0
        var rules = 0
        compose.setContent {
            MeeshyTheme {
                ProgressionDoors(hasGame = true, onOpenNotebook = { notebook++ }, onOpenRules = { rules++ }, onOpenSettings = {})
            }
        }

        compose.onNodeWithText(context.getString(R.string.game_door_notebook)).assertHasClickAction().performClick()

        compose.runOnIdle {
            check(notebook == 1) { "« La Chronique » n'a pas ouvert la Chronique" }
            check(rules == 0) { "« La Chronique » a ouvert le carnet des règles" }
        }
    }

    @Test
    fun `sans bloc de jeu la chronique ne s offre pas`() {
        compose.setContent {
            MeeshyTheme { ProgressionDoors(hasGame = false, onOpenNotebook = {}, onOpenRules = {}, onOpenSettings = {}) }
        }

        compose.onNodeWithText(context.getString(R.string.game_door_notebook)).assertDoesNotExist()
    }

    private val kept = NotebookEntry(
        GamePhotoMoment("start", PhotoStepEmblem.Start), NotebookStatus.Kept, createdAt = 1_700_000_000_000L,
        mode = PhotoMode.Card, storyFile = "start-story.jpg",
    )
    private val waiting = NotebookEntry(GamePhotoMoment("trophy:spring", PhotoStepEmblem.Start), NotebookStatus.Pending, createdAt = 1L)

    @Test
    fun `les photos gardees se partagent se retirent et disent leur place`() {
        val shared = mutableListOf<NotebookEntry>()
        val removed = mutableListOf<NotebookEntry>()
        val state = GameNotebookUiState.ready(null, NotebookShelf(listOf(kept), occupiedBytes = 2_048))
        compose.setContent { MeeshyTheme { GameNotebookContent(state, onShare = { shared += it }, onRemove = { removed += it }) } }

        compose.onNodeWithText(context.getString(R.string.game_notebook_kept)).assertExists()
        compose.onNodeWithTag(NOTEBOOK_PLACE_TAG).assertExists()
        compose.onNodeWithTag(NOTEBOOK_REMOVE_ERROR_TAG).assertDoesNotExist()
        compose.onNodeWithTag(NOTEBOOK_SHARE_TAG).performClick()
        compose.onNodeWithTag(NOTEBOOK_REMOVE_TAG).performClick()

        compose.runOnIdle {
            check(shared == listOf(kept)) { "Partager n'a pas remis la photo gardée" }
            check(removed == listOf(kept)) { "Retirer n'a pas visé la photo gardée" }
        }
    }

    @Test
    fun `un retrait refuse se dit sous les photos gardees`() {
        val state = GameNotebookUiState.ready(null, NotebookShelf(listOf(kept), removalFailed = true))
        compose.setContent { MeeshyTheme { GameNotebookContent(state) } }

        compose.onNodeWithTag(NOTEBOOK_REMOVE_ERROR_TAG).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_notebook_remove_failed)).assertExists()
    }

    @Test
    fun `un moment en attente se photographie depuis la chronique`() {
        val taken = mutableListOf<GamePhotoMoment>()
        val state = GameNotebookUiState.ready(null, NotebookShelf(listOf(waiting)))
        compose.setContent { MeeshyTheme { GameNotebookContent(state, onTake = { taken += it }) } }

        compose.onNodeWithText(context.getString(R.string.game_notebook_pending)).assertExists()
        compose.onNodeWithTag(NOTEBOOK_TAKE_TAG).performClick()

        compose.runOnIdle { check(taken == listOf(waiting.moment)) }
    }

    @Test
    fun `seules les etapes ouvertes se photographient et ouvrent l atelier sur leur moment`() {
        val taken = mutableListOf<GamePhotoMoment>()
        val state = GameNotebookUiState.ready(PhotoCatchUpStanding(rank = GloryRank.Murmure, division = 4, minted = 12))
        compose.setContent { MeeshyTheme { GameNotebookContent(state, onTake = { taken += it }) } }

        val open = state.catchUp.count { it.isOpen }
        compose.onAllNodesWithTag(NOTEBOOK_CATCH_UP_TAKE_TAG).fetchSemanticsNodes().size.let { check(it == open) { "$it boutons pour $open étapes ouvertes" } }
        compose.onAllNodesWithTag(NOTEBOOK_CATCH_UP_TAKE_TAG)[0].performClick()

        compose.runOnIdle { check(taken.map { it.id } == listOf("start")) { "${taken.map { it.id }}" } }
    }
}
