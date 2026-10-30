package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
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
 * Une feuille qui monte — stickers, sons, audience (#13838) — est ancrée en bas, sans voile : la scène se réduit, ENTIÈRE et
 * en 9:16, au-dessus d'elle au lieu d'être grisée et couverte, et seule la feuille parle tant qu'elle est ouverte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w1300dp-h1000dp")
class StorySceneSheetLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(width: Dp = 360.dp, height: Dp = 692.dp, onSheetDismiss: () -> Unit = {}, sheet: () -> StoryComposerSheet?) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = width, height = height)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        reduced = false,
                        scene = { modifier -> Box(modifier.testTag(SCENE)) },
                        top = { SceneTopBar(onClose = {}, history = null, onUndo = {}, onRedo = {}) },
                        trailing = {
                            SceneToolColumn(
                                tools = ComposerSceneTools.column,
                                onTool = {},
                                more = { SceneRoundButton(MeeshyIcons.MoreHorizontal, MORE, onClick = {}) },
                            )
                        },
                        panel = {},
                        socle = {
                            ScenePublishSocle(
                                audience = SceneAudience(label = "Public", icon = MeeshyIcons.Globe),
                                onAudience = {},
                                publishLabel = PUBLISH,
                                canPublish = true,
                                onPublish = {},
                                chevron = null,
                            )
                        },
                        sheet = sheet(),
                        onSheetDismiss = onSheetDismiss,
                        sheetContent = { open ->
                            ComposerAnchoredSheet(fill = open != StoryComposerSheet.AUDIENCE) {
                                Box(Modifier.fillMaxWidth().fillMaxSize().testTag(SHEET))
                            }
                        },
                    )
                }
            }
        }
    }

    private fun bounds(tag: String): DpRect = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()

    private fun drawnBounds(tag: String): DpRect {
        val px = compose.onNodeWithTag(tag).fetchSemanticsNode().layoutInfo.coordinates.boundsInRoot()
        val density = compose.density.density
        return DpRect((px.left / density).dp, (px.top / density).dp, (px.right / density).dp, (px.bottom / density).dp)
    }

    private val DpRect.w: Float get() = (right - left).value

    private val DpRect.h: Float get() = (bottom - top).value

    @Test
    fun `a rising sheet shrinks the scene, whole and 9 by 16, above it instead of covering it`() {
        var open by mutableStateOf<StoryComposerSheet?>(null)
        show { open }
        val rest = drawnBounds(SCENE)

        open = StoryComposerSheet.STICKERS
        compose.waitForIdle()

        val scene = drawnBounds(SCENE)
        val sheet = bounds(SHEET)
        assertThat(sheet.h).isGreaterThan(100f)
        assertThat(scene.w).isLessThan(rest.w)
        assertThat(scene.bottom.value).isAtMost(sheet.top.value + 0.5f)
        assertThat(scene.top.value).isAtLeast(-0.5f)
        assertThat(scene.w / scene.h).isWithin(0.01f).of(9f / 16f)
        assertThat(((scene.left + scene.right) / 2).value).isWithin(0.5f).of(180f)
    }

    @Test
    fun `the sheet is anchored at the bottom across the window`() {
        show { StoryComposerSheet.SOUND }

        val sheet = bounds(SHEET)
        assertThat(sheet.bottom.value).isWithin(0.5f).of(692f)
        assertThat(sheet.w).isWithin(0.5f).of(360f)
    }

    @Test
    fun `while a sheet is up only the sheet speaks - the cross, the tools and publish step aside`() {
        show { StoryComposerSheet.AUDIENCE }

        compose.onNodeWithContentDescription(CLOSE).assertDoesNotExist()
        compose.onNodeWithContentDescription("Text").assertDoesNotExist()
        compose.onNodeWithText(PUBLISH).assertDoesNotExist()
    }

    @Test
    fun `closing the sheet gives the scene back its full size and its controls`() {
        var open by mutableStateOf<StoryComposerSheet?>(StoryComposerSheet.STICKERS)
        show { open }

        open = null
        compose.waitForIdle()

        val scene = drawnBounds(SCENE)
        assertThat(scene.w).isWithin(0.5f).of(360f)
        assertThat(scene.h).isWithin(0.5f).of(640f)
        compose.onNodeWithContentDescription(CLOSE).assertExists()
    }

    @Test
    fun `touching the scene above the sheet closes the sheet`() {
        var dismissed = 0
        show(onSheetDismiss = { dismissed++ }) { StoryComposerSheet.STICKERS }

        compose.onNodeWithContentDescription(SHEET_DISMISS).performClick()

        assertThat(dismissed).isEqualTo(1)
    }

    private companion object {
        const val SCENE = "scene"
        const val SHEET = "sheet"
        const val CLOSE = "Close"
        const val MORE = "More options"
        const val PUBLISH = "Publish the story"
        const val SHEET_DISMISS = "Close the panel"
    }
}
