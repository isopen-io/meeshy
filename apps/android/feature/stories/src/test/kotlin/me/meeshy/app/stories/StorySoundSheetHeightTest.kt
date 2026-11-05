package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
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
 * #16225 : sur un S8 (360 × 740 dp), la feuille Son prend la hauteur de son contenu — son titre et ses trois sources —
 * sans vide sous le dernier bouton ; la scène garde tout le reste. Les stickers, une grille qui défile, gardent la hauteur maximale.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StorySoundSheetHeightTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(open: StoryComposerSheet) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 740.dp)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        scene = { modifier -> Box(modifier.testTag(SCENE)) },
                        top = { SceneTopBar(onClose = {}, history = null, onUndo = {}, onRedo = {}) },
                        trailing = {
                            SceneToolColumn(
                                tools = ComposerSceneTools.column,
                                onTool = {},
                                more = { SceneRoundButton(MeeshyIcons.MoreHorizontal, "More options", onClick = {}) },
                            )
                        },
                        panel = {},
                        socle = {},
                        sheet = open,
                        onSheetDismiss = {},
                        sheetContent = { sheet ->
                            Box(Modifier.testTag(SHEET)) {
                                ComposerAnchoredSheet(fill = sheet.fillsHeight) {
                                    Column(Modifier.fillMaxWidth().testTag(CONTENT)) {
                                        Box(Modifier.fillMaxWidth().height(48.dp))
                                        StorySoundSources(onRecord = {}, onFiles = {}, onLibrary = {})
                                    }
                                }
                            }
                        },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun bounds(tag: String): DpRect = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()

    private val DpRect.h: Float get() = (bottom - top).value

    @Test
    fun `the sound sheet hugs its title and its three sources, with no empty band below them`() {
        show(StoryComposerSheet.SOUND)

        val sheet = bounds(SHEET)
        val content = bounds(CONTENT)
        assertThat(sheet.h).isWithin(0.5f).of(content.h)
        assertThat(sheet.bottom.value).isWithin(0.5f).of(740f)
        assertThat(sheet.h).isLessThan(200f)
    }

    @Test
    fun `the scene keeps everything above the sound sheet`() {
        show(StoryComposerSheet.SOUND)

        assertThat(bounds(SCENE).bottom.value).isWithin(1f).of(bounds(SHEET).top.value)
        assertThat(bounds(SCENE).h).isGreaterThan(480f)
    }

    @Test
    fun `the sticker grid still rises to the full sheet height`() {
        show(StoryComposerSheet.STICKERS)

        assertThat(bounds(SHEET).h).isGreaterThan(bounds(CONTENT).h + 100f)
    }

    private companion object {
        const val SCENE = "scene"
        const val SHEET = "sheet"
        const val CONTENT = "content"
    }
}
