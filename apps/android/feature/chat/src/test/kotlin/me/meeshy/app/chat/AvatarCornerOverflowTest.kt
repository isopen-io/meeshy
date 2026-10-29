package me.meeshy.app.chat

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toPixelMap
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs
import kotlin.math.hypot

/** #13675 : la pastille de présence se pose PAR-DESSUS le bord du cercle, jamais rognée par son hôte. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AvatarCornerOverflowTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `the header avatar shows its presence dot beyond the edge of the disc`() {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                ChatHeaderAvatar(
                    name = "Ana",
                    door = ChatHeaderAvatarDoor.PROFILE,
                    accentColor = MeeshyPalette.Indigo500,
                    imageUrl = null,
                    presence = PresenceState.ONLINE,
                    isUser = true,
                    onOpenProfile = {},
                    onOpenDetails = {},
                    onToggle = {},
                )
                }
            }
        }

        compose.waitForIdle()
        assertThat(dotPixelsOutsideDisc(compose.renderedContent())).isGreaterThan(0)
    }

}

/** Le contenu posé par `setContent`, dessiné en logiciel (la capture par PixelCopy expire sous Robolectric). */
internal fun androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, ComponentActivity>.renderedContent(): ImageBitmap {
    val content = activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as ComposeView
    val bitmap = Bitmap.createBitmap(content.width, content.height, Bitmap.Config.ARGB_8888)
    content.draw(Canvas(bitmap))
    return bitmap.asImageBitmap()
}

/** Les pixels couleur « en ligne » hors du disque inscrit : zéro si l'hôte rogne le coin en cercle. */
internal fun dotPixelsOutsideDisc(image: ImageBitmap, dot: Color = MeeshyPalette.Success): Int {
    val pixels = image.toPixelMap()
    val radius = minOf(image.width, image.height) / 2.0
    val cx = image.width / 2.0
    val cy = image.height / 2.0
    return (0 until image.width).sumOf { x ->
        (0 until image.height).count { y ->
            hypot(x + 0.5 - cx, y + 0.5 - cy) > radius + 1 && pixels[x, y].isNear(dot)
        }
    }
}

private fun Color.isNear(other: Color): Boolean =
    alpha > 0.9f && abs(red - other.red) < 0.08f && abs(green - other.green) < 0.08f && abs(blue - other.blue) < 0.08f
