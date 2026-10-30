package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13636 — un média posé encore sur l'appareil n'est plus peint en carré en attendant son téléversement : la scène lit la
 * forme de la photo comme le lecteur la verra, et ne saute pas à son ratio une fois la photo partie.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PendingPlacedMediaRatioTest {

    @get:Rule
    val compose = createComposeRule()

    private fun jpeg(width: Int, height: Int): MediaUploadItem {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.BLUE) }
        val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
        return MediaUploadItem(bytes, "a.jpg", "image/jpeg")
    }

    @Test
    fun `a photo on the device gives the ratio it will be seen in`() = runTest {
        assertThat(PendingPlacedMediaRatio.of(jpeg(200, 100))).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `a file that is no image gives no ratio`() = runTest {
        assertThat(PendingPlacedMediaRatio.of(MediaUploadItem(ByteArray(8), "v.mp4", "video/mp4"))).isNull()
    }

    @Test
    fun `a landscape photo waiting to upload is framed landscape, not square`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(300.dp, 400.dp)) {
                    PlacedMediaLayer(
                        frame = PlacedMediaFrame(StoryPlacedMedia("m"), model = null, pendingItem = jpeg(200, 100)),
                        canvasWidthPx = 300f,
                        canvasHeightPx = 400f,
                        gestures = PlacedMediaGestures({ _, _, _ -> }, {}, { _, _, _ -> }),
                    )
                }
            }
        }

        compose.waitUntil(timeoutMillis = 5_000) {
            val bounds = compose.onNodeWithTag("placed-media").fetchSemanticsNode().boundsInRoot
            bounds.height < bounds.width
        }
        val bounds = compose.onNodeWithTag("placed-media").fetchSemanticsNode().boundsInRoot
        assertThat(bounds.width / bounds.height).isWithin(0.05f).of(2f)
    }
}
