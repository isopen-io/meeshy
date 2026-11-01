package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La scène d'abord (#13834, maquette du 2026-10-30, état 1) : la scène 9:16 prend la plus grande taille qui tient dans la
 * fenêtre, bord à bord, sans carte autour ; la croix, l'historique, les six outils et Publier sont posés DESSUS. Remplace
 * l'ancienne loi de #12298 (« le panneau laisse la scène à sa taille ») par son inverse : une feuille qui monte réduit la
 * scène, qui reste entière au-dessus d'elle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w1300dp-h1000dp")
class StorySceneFirstLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private data class Setup(
        val width: Dp = 360.dp,
        val height: Dp = 692.dp,
        val history: SceneHistory? = null,
        val chevron: Boolean = false,
        val onPublish: () -> Unit = {},
    )

    private fun show(setup: Setup = Setup(), panelOpen: () -> Boolean = { false }) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = setup.width, height = setup.height)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        reduced = panelOpen(),
                        scene = { modifier -> Box(modifier.testTag(SCENE)) },
                        top = { SceneTopBar(onClose = {}, history = setup.history, onUndo = {}, onRedo = {}) },
                        trailing = {
                            SceneToolColumn(
                                tools = ComposerSceneTools.column,
                                onTool = {},
                                more = { SceneRoundButton(MeeshyIcons.MoreHorizontal, MORE, onClick = {}) },
                            )
                        },
                        panel = { if (panelOpen()) Box(Modifier.fillMaxWidth().height(300.dp).testTag(PANEL)) },
                        socle = {
                            ScenePublishSocle(
                                audience = SceneAudience(label = "Public", icon = MeeshyIcons.Globe),
                                onAudience = {},
                                publishLabel = PUBLISH,
                                canPublish = true,
                                onPublish = setup.onPublish,
                                chevron = if (setup.chevron) ({ SceneRoundButton(MeeshyIcons.ChevronDown, CHEVRON, onClick = {}) }) else null,
                            )
                        },
                    )
                }
            }
        }
    }

    private fun bounds(tag: String): DpRect = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()

    /** Les bornes PEINTES (échelle et décalage du `graphicsLayer` compris), en dp. */
    private fun drawnBounds(tag: String): DpRect {
        val px = compose.onNodeWithTag(tag).fetchSemanticsNode().layoutInfo.coordinates.boundsInRoot()
        val density = compose.density.density
        return DpRect((px.left / density).dp, (px.top / density).dp, (px.right / density).dp, (px.bottom / density).dp)
    }

    private fun boundsOf(description: String): DpRect = compose.onNodeWithContentDescription(description).getUnclippedBoundsInRoot()

    private val DpRect.w: Float get() = (right - left).value

    private val DpRect.h: Float get() = (bottom - top).value

    private fun DpRect.isInside(outer: DpRect): Boolean =
        left >= outer.left && top >= outer.top && right <= outer.right && bottom <= outer.bottom

    @Test
    fun `at rest on a phone the scene is the widest 9 by 16 that fits, edge to edge, with no card around it`() {
        show()

        val scene = bounds(SCENE)
        assertThat(scene.left.value).isWithin(0.5f).of(0f)
        assertThat(scene.top.value).isWithin(0.5f).of(0f)
        assertThat(scene.w).isWithin(0.5f).of(360f)
        assertThat(scene.h).isWithin(0.5f).of(640f)
    }

    @Test
    fun `on a window wider than 9 by 16 the scene takes the whole height, centred`() {
        show(Setup(width = 1280.dp, height = 752.dp))

        val scene = bounds(SCENE)
        assertThat(scene.h).isWithin(0.5f).of(752f)
        assertThat(scene.w).isWithin(0.5f).of(423f)
        assertThat(scene.left.value).isWithin(0.5f).of((1280f - 423f) / 2f)
    }

    @Test
    fun `the cross, the round tools - background, mention and place included - and publish are laid on the scene`() {
        show()

        val scene = bounds(SCENE)
        listOf(CLOSE, "Text", "Media", "Sticker", "Sound", "Drawing", "Background", "Mention", "Place", MORE).forEach { name ->
            assertThat(boundsOf(name).isInside(scene)).isTrue()
        }
        assertThat(compose.onNodeWithText(PUBLISH).getUnclippedBoundsInRoot().isInside(scene)).isTrue()
        assertThat(compose.onNodeWithText("Public").getUnclippedBoundsInRoot().isInside(scene)).isTrue()
    }

    @Test
    fun `each round tool is a 48 dp target`() {
        show()

        listOf(CLOSE, "Text", "Media", "Sticker", "Sound", "Drawing", "Background", "Mention", "Place", MORE).forEach { name ->
            compose.onNodeWithContentDescription(name).assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `an undo or redo with no step to replay is hidden, never greyed`() {
        var history by mutableStateOf<SceneHistory?>(null)
        compose.setContent {
            MeeshyTheme { SceneTopBar(onClose = {}, history = history, onUndo = {}, onRedo = {}) }
        }
        compose.onNodeWithContentDescription(UNDO).assertDoesNotExist()
        compose.onNodeWithContentDescription(REDO).assertDoesNotExist()

        history = SceneHistory(canUndo = true, canRedo = false)
        compose.waitForIdle()

        compose.onNodeWithContentDescription(UNDO).assertIsEnabled()
        compose.onNodeWithContentDescription(REDO).assertDoesNotExist()

        history = SceneHistory(canUndo = false, canRedo = true)
        compose.waitForIdle()

        compose.onNodeWithContentDescription(UNDO).assertDoesNotExist()
        compose.onNodeWithContentDescription(REDO).assertIsEnabled()

        history = SceneHistory(canUndo = true, canRedo = true)
        compose.waitForIdle()

        compose.onNodeWithContentDescription(UNDO).assertIsEnabled()
        compose.onNodeWithContentDescription(REDO).assertIsEnabled()
    }

    @Test
    fun `each lifted finger over the composer closes the gesture of the history, once`() {
        var lifts = 0
        compose.setContent {
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier.size(200.dp).closesGestureOnLift { lifts++ }.testTag("composer"),
            )
        }

        compose.onNodeWithTag("composer").performTouchInput {
            down(center)
            moveBy(androidx.compose.ui.geometry.Offset(30f, 0f))
            moveBy(androidx.compose.ui.geometry.Offset(30f, 0f))
            up()
        }
        compose.onNodeWithTag("composer").performTouchInput { down(center); up() }

        assertThat(lifts).isEqualTo(2)
    }

    @Test
    fun `the lane history hides the side with nothing to replay`() {
        compose.setContent {
            MeeshyTheme { androidx.compose.foundation.layout.Column { SceneLaneHistory(SceneHistory(canUndo = true, canRedo = false), onUndo = {}, onRedo = {}) } }
        }

        compose.onNodeWithContentDescription(UNDO).assertIsEnabled()
        compose.onNodeWithContentDescription(REDO).assertDoesNotExist()
    }

    @Test
    fun `publish has no chevron unless the host offers another format`() {
        show()
        compose.onNodeWithContentDescription(CHEVRON).assertDoesNotExist()
    }

    @Test
    fun `the chevron the host offers closes the publish button, on its row`() {
        show(Setup(chevron = true))

        val body = boundsOf(PUBLISH)
        val chevron = boundsOf(CHEVRON)
        assertThat(chevron.left.value).isAtLeast(body.right.value - 0.5f)
        assertThat(((chevron.top + chevron.bottom) / 2).value).isIn(com.google.common.collect.Range.closed(body.top.value, body.bottom.value))
    }

    @Test
    fun `publish is a named target of at least 48 dp that publishes from its body`() {
        var clicks = 0
        show(Setup(onPublish = { clicks++ }))

        compose.onNodeWithContentDescription(PUBLISH)
            .assertIsEnabled().assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText(PUBLISH).performClick()
        assertThat(clicks).isEqualTo(1)
    }

    @Test
    fun `opening a panel shrinks the scene, whole and 9 by 16, above the panel instead of covering it`() {
        var open by mutableStateOf(false)
        show { open }
        val rest = drawnBounds(SCENE)

        open = true
        compose.waitForIdle()

        val scene = drawnBounds(SCENE)
        val panel = bounds(PANEL)
        assertThat(scene.w).isLessThan(rest.w)
        assertThat(scene.bottom.value).isAtMost(panel.top.value + 0.5f)
        assertThat(scene.w / scene.h).isWithin(0.01f).of(9f / 16f)
    }

    @Test
    fun `with a panel up the round tools stay whole 48 dp targets instead of being squashed`() {
        show { true }

        listOf("Text", "Media", "Sticker", "Sound", "Drawing", "Background", "Mention", "Place", MORE).forEach { name ->
            compose.onNodeWithContentDescription(name).assertExists().assertHeightIsAtLeast(48.dp)
        }
    }

    private companion object {
        const val SCENE = "scene"
        const val PANEL = "panel"
        const val CLOSE = "Close"
        const val UNDO = "Undo"
        const val REDO = "Redo"
        const val MORE = "More options"
        const val PUBLISH = "Publish the story"
        const val CHEVRON = "Publish as"
    }
}
