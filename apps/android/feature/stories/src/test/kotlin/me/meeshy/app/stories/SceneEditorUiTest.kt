package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le câblage état → écran de l'éditeur de scène : inspecteur, menu d'appui long, frise. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneEditorUiTest {

    @get:Rule
    val compose = createComposeRule()

    private fun stickerState(): StoryComposerUiState =
        StoryComposerSceneReducer.windowed(
            StoryComposerStickerReducer.added(StoryComposerUiState(), "😀", "s1"), "s1", 2f, 6f,
        )

    @Test
    fun `l'inspecteur dit la valeur de chaque jeton et seule la fenetre est un bouton`() {
        var opened = 0
        compose.setContent {
            MeeshyTheme { SceneInspectorRow(stickerState().sceneInspector!!, onOpenTiming = { opened++ }) }
        }

        compose.onNodeWithText("SIZE", substring = true).assertIsDisplayed()
        compose.onNodeWithText("0:02 → 0:08").assertIsDisplayed().performClick()
        assertThat(opened).isEqualTo(1)
        compose.onAllNodes(hasClickAction()).assertCountEquals(1)
    }

    @Test
    fun `le menu d'un sticker seul ne sert que dupliquer et supprimer`() {
        val menu = SceneObjectContextMenu(
            SceneObjectRef(ComposerObjectKind.STICKER, "s1"),
            listOf(SceneObjectMenu.Action.DUPLICATE, SceneObjectMenu.Action.DELETE),
        )
        val chosen = mutableListOf<SceneObjectMenu.Action>()
        compose.setContent {
            MeeshyTheme { SceneObjectMenuPopup(menu = menu, onAction = { chosen += it }, onDismiss = {}) }
        }

        compose.onNodeWithText("Bring forward").assertDoesNotExist()
        compose.onNodeWithText("Delete").performClick()
        assertThat(chosen).containsExactly(SceneObjectMenu.Action.DELETE)
    }

    @Test
    fun `la frise nomme ses pistes et propose Entre ici Sort ici sur l'objet choisi`() {
        val state = stickerState()
        val windows = mutableListOf<Triple<String, Float, Float>>()
        compose.setContent {
            MeeshyTheme {
                SceneFrise(
                    tracks = state.sceneTracks,
                    editableIds = state.sceneEditableTrackIds,
                    selectedId = "s1",
                    slideDurationSeconds = 10f,
                    playheadSeconds = 4f,
                    onSelectTrack = { _, _ -> },
                    onScrub = {},
                    onWindow = { id, s, d -> windows += Triple(id, s, d) },
                )
            }
        }

        compose.onNodeWithText("😀").assertIsDisplayed()
        compose.onNodeWithText("0:04 / 0:10").assertIsDisplayed()
        compose.onNodeWithText("Exits here").performClick()
        assertThat(windows.single()).isEqualTo(Triple("s1", 2f, 2f))
    }

    @Test
    fun `une frise sans objet invite a poser un texte ou un sticker`() {
        compose.setContent {
            MeeshyTheme {
                SceneFrise(
                    tracks = emptyList(), editableIds = emptySet(), selectedId = null,
                    slideDurationSeconds = 5f, playheadSeconds = 0f,
                    onSelectTrack = { _, _ -> }, onScrub = {}, onWindow = { _, _, _ -> },
                )
            }
        }

        compose.onAllNodesWithText("Add a text or a sticker", substring = true).assertCountEquals(1)
    }

    @Test
    fun `un sticker rappelle le dernier rappel apres une recomposition`() {
        var tapped = ""
        var label by mutableStateOf("premier")
        compose.setContent {
            MeeshyTheme {
                val current = label
                StickerLayer(
                    sticker = StoryStickerElement(id = "s1", emoji = "😀"),
                    selected = false, menu = null,
                    canvasWidthPx = 720f, canvasHeightPx = 1280f,
                    onTap = { tapped = current }, onLongPress = {},
                    onMenuAction = {}, onMenuDismiss = {},
                    onDrag = { _, _ -> }, onTransform = { _, _ -> },
                )
            }
        }

        label = "second"
        compose.waitForIdle()
        compose.onNodeWithText("😀").performClick()

        assertThat(tapped).isEqualTo("second")
    }

    @Test
    fun `un texte rappelle le dernier rappel apres une recomposition`() {
        var tapped = ""
        var label by mutableStateOf("premier")
        compose.setContent {
            MeeshyTheme {
                val current = label
                TextElementLayer(
                    element = StoryTextElement(id = "t1", text = "Bonjour"),
                    selected = false, menu = null,
                    canvasWidthPx = 720f, canvasHeightPx = 1280f,
                    onTap = { tapped = current }, onLongPress = {},
                    onMenuAction = {}, onMenuDismiss = {},
                    onDrag = { _, _ -> }, onDragEnd = {}, onTransform = { _, _ -> },
                )
            }
        }

        label = "second"
        compose.waitForIdle()
        compose.onNodeWithText("Bonjour").performClick()

        assertThat(tapped).isEqualTo("second")
    }
}
