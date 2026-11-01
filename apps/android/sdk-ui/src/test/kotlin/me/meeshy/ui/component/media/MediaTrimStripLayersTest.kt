package me.meeshy.ui.component.media

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.testTag
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Recette S8 du 2026-11-01 : la bande « Couper » d'une vidéo sombre restait presque blanche. La vignette se voit PLEINE dans
 * la fenêtre gardée, un voile n'assombrit que ce qu'on retire, le cadre et les poignées passent par-dessus (iOS
 * `MediaTrimStrip`, les éditeurs vidéo).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MediaTrimStripLayersTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val dark = Color(0xFF203040)

    private fun frame(): ImageBitmap =
        Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.rgb(0x20, 0x30, 0x40)) }.asImageBitmap()

    @Test
    fun `la vignette d'une video sombre se voit pleine dans la fenetre gardee, assombrie hors d'elle`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(348.dp).testTag("strip")) {
                    MediaTrimStrip(
                        content = MediaTrimContent.VIDEO,
                        sourceDuration = 8.0,
                        bounds = MediaTrimBounds(2.0, 6.0),
                        accent = Color(0xFF6366F1),
                        frames = List(8) { frame() },
                        onChange = {},
                    )
                }
            }
        }

        val root = compose.activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0)
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { root.draw(android.graphics.Canvas(bitmap)) }
        val box = compose.onNodeWithTag("strip").getUnclippedBoundsInRoot()
        val px = compose.activity.resources.displayMetrics.density
        val y = ((box.top.value + 28f) * px).toInt()
        fun at(dp: Float) = Color(bitmap.getPixel(((box.left.value + dp) * px).toInt(), y))
        val kept = at(174f)
        val removed = at(60f)

        assertThat(kept.red).isWithin(0.03f).of(dark.red)
        assertThat(kept.green).isWithin(0.03f).of(dark.green)
        assertThat(kept.blue).isWithin(0.03f).of(dark.blue)
        assertThat(removed.blue).isLessThan(kept.blue)
    }
}
