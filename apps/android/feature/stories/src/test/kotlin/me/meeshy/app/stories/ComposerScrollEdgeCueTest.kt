package me.meeshy.app.stories

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasScrollAction
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundAction
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool
import me.meeshy.feature.stories.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14666 — comme iOS (`ComposerScrollEdgeCue`, #14622) : un rail du compositeur qui déborde s'efface en fondu de 28 dp au bord
 * derrière lequel des entrées attendent, et le fondu se retire dès que ce bord est atteint. Se lit au pixel, sur un fond
 * d'une couleur que rien d'autre ne porte : un bord effacé laisse voir ce fond, un bord atteint montre le contenu.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ComposerScrollEdgeCueTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val ground = Color(0xFFFF00FF)
    private val ink = Color(0xFF00FF00)

    private fun show(viewportDp: Int, rail: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(120.dp).height(viewportDp.dp).background(ground).testTag(VIEWPORT)) { rail() }
            }
        }
        compose.waitForIdle()
    }

    private fun plainRail(entries: Int, state: @Composable () -> ScrollState = { rememberScrollState() }): @Composable () -> Unit = {
        Column(Modifier.fillMaxWidth().composerScrollEdgeCue(state())) {
            repeat(entries) { Box(Modifier.fillMaxWidth().height(40.dp).background(ink)) }
        }
    }

    /** Le viewport dessiné en logiciel : la capture par PixelCopy expire sous Robolectric. */
    private fun image(): ImageBitmap {
        val content = compose.activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as ComposeView
        val full = Bitmap.createBitmap(content.width, content.height, Bitmap.Config.ARGB_8888)
        content.draw(Canvas(full))
        val bounds = compose.onNodeWithTag(VIEWPORT).fetchSemanticsNode().boundsInRoot
        return Bitmap.createBitmap(full, bounds.left.toInt(), bounds.top.toInt(), bounds.width.toInt(), bounds.height.toInt()).asImageBitmap()
    }

    private fun ImageBitmap.rowShowsGround(y: Int): Boolean {
        val pixels = toPixelMap()
        return (0 until width).all { x -> pixels[x, y].isNear(ground) }
    }

    private fun ImageBitmap.rowShowsInk(y: Int): Boolean {
        val pixels = toPixelMap()
        return (0 until width).all { x -> pixels[x, y].isNear(ink) }
    }

    private fun Color.isNear(other: Color): Boolean =
        kotlin.math.abs(red - other.red) < 0.08f && kotlin.math.abs(green - other.green) < 0.08f && kotlin.math.abs(blue - other.blue) < 0.08f

    private fun scrollBy(px: Float) {
        compose.onNode(hasScrollAction()).performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, px) }
        compose.waitForIdle()
    }

    @Test
    fun `at rest an overflowing rail fades its bottom edge and keeps its top edge`() {
        show(viewportDp = 200, rail = plainRail(entries = 12))
        val shot = image()
        assertWithMessage("bord bas, des entrées attendent").that(shot.rowShowsGround(shot.height - 1)).isTrue()
        assertWithMessage("bord haut atteint").that(shot.rowShowsInk(0)).isTrue()
        assertWithMessage("milieu").that(shot.rowShowsInk(shot.height / 2)).isTrue()
    }

    @Test
    fun `scrolled midway the rail fades both edges`() {
        show(viewportDp = 200, rail = plainRail(entries = 12))
        scrollBy(400f)
        val shot = image()
        assertThat(shot.rowShowsGround(0)).isTrue()
        assertThat(shot.rowShowsGround(shot.height - 1)).isTrue()
        assertThat(shot.rowShowsInk(shot.height / 2)).isTrue()
    }

    @Test
    fun `at the end the fade leaves the bottom edge and stays on the top edge`() {
        show(viewportDp = 200, rail = plainRail(entries = 12))
        scrollBy(100_000f)
        val shot = image()
        assertWithMessage("bord haut, des entrées attendent").that(shot.rowShowsGround(0)).isTrue()
        assertWithMessage("bord bas atteint").that(shot.rowShowsInk(shot.height - 1)).isTrue()
    }

    @Test
    fun `a rail that fits shows no fade`() {
        show(viewportDp = 200, rail = plainRail(entries = 5))
        val shot = image()
        assertThat(shot.rowShowsInk(0)).isTrue()
        assertThat(shot.rowShowsInk(shot.height - 1)).isTrue()
    }

    @Test
    fun `the fade spans 28 dp and no more`() {
        show(viewportDp = 200, rail = plainRail(entries = 12))
        val shot = image()
        val fadePx = (28 * 3)
        assertWithMessage("au-dessus du fondu, le contenu est entier").that(shot.rowShowsInk(shot.height - fadePx - 3)).isTrue()
        assertWithMessage("dans le fondu, il s'efface").that(shot.rowShowsInk(shot.height - fadePx / 2)).isFalse()
    }

    /**
     * Les rails réels : où que tombe leur bord bas en défilant, tant que des entrées attendent dessous, ce bord laisse voir le
     * fond — une colonne SANS fondu montre tôt ou tard une cible coupée net à cet endroit.
     */
    private fun assertRealRailFades(rail: @Composable () -> Unit) {
        show(viewportDp = 160, rail = rail)
        var sawContentAbove = false
        repeat(14) {
            val shot = image()
            assertWithMessage("bord bas, pas $it").that(shot.rowShowsGround(shot.height - 1)).isTrue()
            if (!shot.rowShowsGround(shot.height - 40 * 3)) sawContentAbove = true
            scrollBy(7f * 3)
        }
        assertWithMessage("le témoin voit bien des entrées").that(sawContentAbove).isTrue()
    }

    @Test
    fun `the tool column fades the edge that hides tools`() = assertRealRailFades {
        SceneToolColumn(
            tools = ComposerSceneTools.column - ComposerSceneTool.MORE,
            onTool = {},
            more = {},
        )
    }

    @Test
    fun `the editing rail of an object fades the edge that hides options`() = assertRealRailFades {
        SceneOptionColumn(
            bar = SceneSelectionBar(
                ref = SceneObjectRef(ComposerObjectKind.MEDIA, "m"),
                actions = ComposerSelectionAction.entries,
                sheetActions = emptyList(),
            ),
            tools = List(6) { RailTool(MeeshyIcons.Sparkles, R.string.stories_composer_background) {} },
            onAction = {},
        )
    }

    @Test
    fun `the rail of a media background fades the edge that hides its entries`() = assertRealRailFades {
        SceneBackgroundColumn(
            background = BackgroundEditing(
                actions = ComposerBackgroundAction.entries,
                sources = emptyList(),
                onAction = {},
                onSource = {},
                confirming = false,
                onConfirmRemove = {},
                onCancelRemove = {},
            ),
            tools = BackgroundTools(tools = ComposerBackgroundTool.entries, looping = false, onTool = {}),
        )
    }

    private companion object {
        const val VIEWPORT = "viewport"
    }
}
