package me.meeshy.app.stories

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
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
        // Un seul mot pour retirer un objet (#14256) : celui du rail de sélection et de la frise, comme l'appui long iOS.
        compose.onNodeWithText("Delete").assertDoesNotExist()
        compose.onNodeWithText("Remove").performClick()
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
    fun `en arabe la frise garde le temps de gauche a droite, ses noms a gauche de l'axe`() {
        val state = stickerState()
        compose.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MeeshyTheme {
                    SceneFrise(
                        tracks = state.sceneTracks,
                        editableIds = state.sceneEditableTrackIds,
                        selectedId = "s1",
                        slideDurationSeconds = 10f,
                        playheadSeconds = 0f,
                        onSelectTrack = { _, _ -> },
                        onScrub = {},
                        onWindow = { _, _, _ -> },
                        modifier = Modifier.width(360.dp),
                    )
                }
            }
        }

        val label = compose.onNodeWithText("😀").getUnclippedBoundsInRoot()
        assertThat(label.left.value).isLessThan(90f)
    }

    @Test
    fun `TalkBack deplace une piste et regle son entree et sa sortie par demi-seconde`() {
        val state = stickerState()
        val windows = mutableListOf<Triple<String, Float, Float>>()
        compose.setContent {
            MeeshyTheme {
                SceneFrise(
                    tracks = state.sceneTracks,
                    editableIds = state.sceneEditableTrackIds,
                    selectedId = "s1",
                    slideDurationSeconds = 10f,
                    playheadSeconds = 0f,
                    onSelectTrack = { _, _ -> },
                    onScrub = {},
                    onWindow = { id, s, d -> windows += Triple(id, s, d) },
                )
            }
        }

        val actions = compose.onNodeWithText("😀").fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].associateBy { it.label }
        assertThat(actions.keys).containsAtLeast(
            "Earlier", "Later", "Enter earlier", "Enter later", "Exit earlier", "Exit later",
        )
        compose.runOnIdle {
            actions.getValue("Exit later").action()
            actions.getValue("Earlier").action()
            actions.getValue("Enter later").action()
        }

        assertThat(windows).containsExactly(
            Triple("s1", 2f, 6.5f),
            Triple("s1", 1.5f, 6f),
            Triple("s1", 2.5f, 5.5f),
        ).inOrder()
    }

    @Test
    fun `Couper n'apparait que pour un objet coupable dont la tete est dans la fenetre`() {
        val state = stickerState()
        val split = mutableListOf<String>()
        var playhead by mutableStateOf(4f)
        compose.setContent {
            MeeshyTheme {
                SceneFrise(
                    tracks = state.sceneTracks,
                    editableIds = state.sceneEditableTrackIds,
                    selectedId = "s1",
                    slideDurationSeconds = 10f,
                    playheadSeconds = playhead,
                    onSelectTrack = { _, _ -> },
                    onScrub = {},
                    onWindow = { _, _, _ -> },
                    splittableIds = setOf("s1"),
                    onSplit = { split += it },
                )
            }
        }

        compose.onNodeWithText("Split").performClick()
        assertThat(split).containsExactly("s1")
        playhead = 9f
        compose.waitForIdle()
        compose.onNodeWithText("Split").assertDoesNotExist()
    }

    @Test
    fun `la frise tend sa lecture au transport de l'hote, que la scene vivante suit`() {
        val state = stickerState()
        val transport = FriseTransport()
        var shown by mutableStateOf(true)
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalFriseTransport provides transport) {
                    if (shown) {
                        SceneFrise(
                            tracks = state.sceneTracks,
                            editableIds = state.sceneEditableTrackIds,
                            selectedId = null,
                            slideDurationSeconds = 10f,
                            playheadSeconds = 1f,
                            onSelectTrack = { _, _ -> },
                            onScrub = {},
                            onWindow = { _, _, _ -> },
                        )
                    }
                }
            }
        }

        assertThat(transport.isOpen).isTrue()
        compose.onNodeWithContentDescription("Play").performClick()
        assertThat(transport.playing).isTrue()
        shown = false
        compose.waitForIdle()
        assertThat(transport.isOpen).isFalse()
        assertThat(transport.playing).isFalse()
    }

    @Test
    fun `Lire fait avancer la tete au rythme de la scene, Pause l'arrete`() {
        val state = stickerState()
        var playhead by mutableStateOf(1f)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme {
                SceneFrise(
                    tracks = state.sceneTracks,
                    editableIds = state.sceneEditableTrackIds,
                    selectedId = null,
                    slideDurationSeconds = 10f,
                    playheadSeconds = playhead,
                    onSelectTrack = { _, _ -> },
                    onScrub = { playhead = it },
                    onWindow = { _, _, _ -> },
                )
            }
        }

        compose.onNodeWithContentDescription("Play").performClick()
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(playhead).isWithin(0.1f).of(2f)
        compose.onNodeWithContentDescription("Pause").performClick()
        compose.mainClock.advanceTimeBy(1_000)
        val stopped = playhead
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(playhead).isEqualTo(stopped)
        compose.onNodeWithContentDescription("Play").assertExists()
    }

    @Test
    fun `Dupliquer et Retirer servent l'objet choisi depuis la frise`() {
        val state = stickerState()
        val duplicated = mutableListOf<String>()
        val removed = mutableListOf<String>()
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
                    onWindow = { _, _, _ -> },
                    onDuplicate = { duplicated += it },
                    onRemove = { removed += it },
                )
            }
        }

        compose.onNodeWithContentDescription("Duplicate").performClick()
        compose.onNodeWithContentDescription("Remove").performClick()
        assertThat(duplicated).containsExactly("s1")
        assertThat(removed).containsExactly("s1")
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
                    onDrag = { _, _ -> }, onDragEnd = {}, onTransform = { _, _ -> },
                )
            }
        }

        label = "second"
        compose.waitForIdle()
        compose.onNodeWithText("😀").performClick()

        assertThat(tapped).isEqualTo("second")
    }

    @Test
    fun `TalkBack ouvre le menu d'un sticker et d'un texte par l'action d'appui long`() {
        val opened = mutableListOf<String>()
        compose.setContent {
            MeeshyTheme {
                StickerLayer(
                    sticker = StoryStickerElement(id = "s1", emoji = "😀"),
                    selected = false, menu = null,
                    canvasWidthPx = 720f, canvasHeightPx = 1280f,
                    onTap = {}, onLongPress = { opened += "s1" },
                    onMenuAction = {}, onMenuDismiss = {},
                    onDrag = { _, _ -> }, onDragEnd = {}, onTransform = { _, _ -> },
                )
                TextElementLayer(
                    element = StoryTextElement(id = "t1", text = "Bonjour"),
                    selected = false, menu = null,
                    canvasWidthPx = 720f, canvasHeightPx = 1280f,
                    onTap = {}, onLongPress = { opened += "t1" },
                    onMenuAction = {}, onMenuDismiss = {},
                    onDrag = { _, _ -> }, onDragEnd = {}, onTransform = { _, _ -> },
                )
            }
        }

        compose.onNode(hasContentDescription("😀")).performSemanticsAction(SemanticsActions.OnLongClick)
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.OnLongClick))[1]
            .performSemanticsAction(SemanticsActions.OnLongClick)

        assertThat(opened).containsExactly("s1", "t1").inOrder()
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
