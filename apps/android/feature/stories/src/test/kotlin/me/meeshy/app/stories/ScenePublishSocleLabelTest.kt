package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14826 — recette S8 sur un écran court (360 × 545 dp) : la scène 9:16 n'y fait que 306 dp de large, et le libellé de
 * Publier passait sur deux lignes (« Publier / le post »), puis se tronquait (« Publier / la sto… ») avec Story et Post
 * cochés. Le libellé tient désormais sur UNE ligne : entier, puis entier en plus petit, puis « Publier ». Le nom complet
 * reste celui qu'entend le lecteur d'écran.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h545dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScenePublishSocleLabelTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(label: String) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 545.dp)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        scene = { modifier -> Box(modifier) },
                        top = { SceneTopBar(onClose = {}, history = null, onUndo = {}, onRedo = {}) },
                        trailing = {
                            SceneToolColumn(
                                tools = ComposerSceneTools.column,
                                onTool = {},
                                more = { SceneRoundButton(MeeshyIcons.MoreHorizontal, "Plus", onClick = {}) },
                            )
                        },
                        panel = {},
                        socle = {
                            ScenePublishSocle(
                                audience = SceneAudience(label = "Public", icon = MeeshyIcons.Globe),
                                onAudience = {},
                                publishLabel = label,
                                canPublish = true,
                                onPublish = {},
                                chevron = { SceneRoundButton(MeeshyIcons.ChevronDown, "Type de publication", onClick = {}) },
                            )
                        },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun showNarrow(label: String) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(200.dp)) {
                    ScenePublishSocle(
                        audience = SceneAudience(label = "Public", icon = MeeshyIcons.Globe),
                        onAudience = {},
                        publishLabel = label,
                        canPublish = true,
                        onPublish = {},
                        chevron = { SceneRoundButton(MeeshyIcons.ChevronDown, "Type de publication", onClick = {}) },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun shown(full: String): Pair<String, SemanticsNodeInteraction> {
        val text = listOf(full, SHORT).first { compose.onAllNodesWithText(it, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        return text to compose.onNodeWithText(text, useUnmergedTree = true)
    }

    private fun SemanticsNodeInteraction.layout(): TextLayoutResult {
        val results = mutableListOf<TextLayoutResult>()
        fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action?.invoke(results)
        return results.single()
    }

    private fun assertOneWholeLine(full: String) {
        show(full)
        val (text, node) = shown(full)
        val layout = node.layout()
        assertWithMessage("« $text » sur ${layout.lineCount} ligne(s)").that(layout.lineCount).isEqualTo(1)
        assertWithMessage("« $text » tronqué").that(layout.isLineEllipsized(0)).isFalse()
        assertWithMessage("« $text » déborde de sa place").that(layout.getLineRight(0)).isAtMost(layout.size.width.toFloat())
        assertWithMessage("« $text » coupé en hauteur").that(layout.didOverflowHeight).isFalse()
    }

    @Test
    fun `publish the post holds on one whole line on a short screen`() = assertOneWholeLine("Publier le post")

    @Test
    fun `publish the story and the post holds on one whole line on a short screen`() =
        assertOneWholeLine("Publier la story et le post")

    @Test
    fun `the longest publish label holds on one whole line on a short screen`() =
        assertOneWholeLine("Publier la story, le post et le réel")

    @Test
    fun `a label too long for the capsule falls back to publish, never to a cut word`() {
        val full = "Publier la story, le post et le réel"
        show(full)
        assertThat(shown(full).first).isEqualTo(SHORT)
    }

    @Test
    fun `a label that fits is read whole`() {
        assertOneWholeLine("Publier la story")
        assertThat(shown("Publier la story").first).isEqualTo("Publier la story")
    }

    @Test
    fun `a capsule too narrow even for publish shows its arrow alone, never a cut word`() {
        val full = "Publier la story et le post"
        showNarrow(full)

        val textInCapsule = hasAnyAncestor(hasContentDescription(full)) and SemanticsMatcher.keyIsDefined(SemanticsProperties.Text)
        assertThat(compose.onAllNodes(textInCapsule, useUnmergedTree = true).fetchSemanticsNodes()).isEmpty()
        compose.onNodeWithContentDescription(full).assertExists()
    }

    @Test
    fun `the screen reader still hears the whole name when the capsule shows publish`() {
        val full = "Publier la story et le post"
        show(full)
        compose.onNodeWithContentDescription(full).assertExists()
    }

    @Test
    fun `the capsule keeps a touch target height`() {
        val full = "Publier la story et le post"
        show(full)
        val capsule = compose.onNodeWithContentDescription(full).getUnclippedBoundsInRoot()
        val text = shown(full).second.getUnclippedBoundsInRoot()
        assertThat(capsule.height).isAtLeast(48.dp)
        assertThat(capsule.top).isAtMost(text.top)
        assertThat(capsule.bottom).isAtLeast(text.bottom)
    }

    private companion object {
        const val SHORT = "Publier"
    }
}
