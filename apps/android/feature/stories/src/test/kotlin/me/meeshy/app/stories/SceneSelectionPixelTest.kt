package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14701, mesuré sur iOS : depuis #14206 (décision porteur du 2026-11-01), le canvas iOS ne pose plus aucun cadre autour de
 * l'objet sélectionné — `setSelectionMarker` n'attache que le badge d'envoi. Android suit (#14207) : au pixel près, un
 * sticker ou un texte touché (sélectionné, pas en écriture) se peint exactement comme non sélectionné ; la sélection se lit au
 * rail qui change.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w300dp-h400dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SceneSelectionPixelTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun paintedBothWays(layer: @Composable (selected: Boolean) -> Unit): Pair<IntArray, IntArray> {
        var selected by mutableStateOf(false)
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(300.dp, 400.dp).background(Color.Black)) { layer(selected) }
            }
        }
        val idle = capture()
        selected = true
        val chosen = capture()
        return idle to chosen
    }

    private fun capture(): IntArray {
        compose.waitForIdle()
        val content = compose.activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as ComposeView
        val bitmap = Bitmap.createBitmap(content.width, content.height, Bitmap.Config.ARGB_8888)
        content.draw(Canvas(bitmap))
        return IntArray(bitmap.width * bitmap.height).also { bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height) }
    }

    private fun differingPixels(pair: Pair<IntArray, IntArray>): Int = pair.first.indices.count { pair.first[it] != pair.second[it] }

    @Test
    fun `a selected sticker paints exactly the pixels of an unselected one, like iOS`() {
        val pair = paintedBothWays { selected ->
            StickerLayer(
                sticker = StoryStickerElement(id = "s", emoji = "🙂", scale = 1f),
                selected = selected,
                menu = null,
                canvasWidthPx = 300f,
                canvasHeightPx = 400f,
                onTap = {},
                onLongPress = {},
                onMenuAction = {},
                onMenuDismiss = {},
                onDrag = { _, _ -> },
                onDragEnd = {},
                onTransform = { _, _ -> },
            )
        }

        assertThat(pair.first.any { it != pair.first[0] }).isTrue()
        assertThat(differingPixels(pair)).isEqualTo(0)
    }

    @Test
    fun `a text touched, selected but not being written, paints exactly the pixels of an unselected one, like iOS`() {
        val pair = paintedBothWays { selected ->
            TextElementLayer(
                element = StoryTextElement(id = "t", text = "Bonjour"),
                selected = selected,
                menu = null,
                inlineEditEnabled = false,
                canvasWidthPx = 300f,
                canvasHeightPx = 400f,
                onTap = {},
                onLongPress = {},
                onMenuAction = {},
                onMenuDismiss = {},
                onDrag = { _, _ -> },
                onDragEnd = {},
                onTransform = { _, _ -> },
            )
        }

        assertThat(pair.first.any { it != pair.first[0] }).isTrue()
        assertThat(differingPixels(pair)).isEqualTo(0)
    }
}
