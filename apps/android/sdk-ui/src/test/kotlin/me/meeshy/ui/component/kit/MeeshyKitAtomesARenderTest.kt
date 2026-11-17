package me.meeshy.ui.component.kit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * K42, K45, K55 rendus : ce que la recette annonce, l'image le montre. Une jauge périmée n'a plus de couleur, un dégradé part
 * du bord de début dans les deux sens de lecture, un médaillon en aplat porte son encre sombre en thème clair comme en sombre,
 * l'organique dérive sans recomposer, et la touche nomme la flèche qu'elle montre en arabe.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeshyKitAtomesARenderTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun render(
        direction: LayoutDirection = LayoutDirection.Ltr,
        reduceMotion: Boolean = true,
        content: @Composable () -> Unit,
    ) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalLayoutDirection provides direction, LocalReduceMotion provides reduceMotion) {
                    Box(Modifier.background(Color.White).padding(8.dp)) { content() }
                }
            }
        }
        compose.waitForIdle()
    }

    private class Shot(val bitmap: Bitmap, val bounds: Rect) {
        fun at(x: Int, y: Int): Color = Color(bitmap.getPixel(x, y))

        fun all(): List<Color> = (bounds.left.toInt() until bounds.right.toInt()).flatMap { x ->
            (bounds.top.toInt() until bounds.bottom.toInt()).map { y -> at(x, y) }
        }
    }

    private fun shot(tag: String): Shot {
        val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
        val root = compose.activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { root.draw(Canvas(bitmap)) }
        return Shot(bitmap, bounds)
    }

    private fun Color.isReddish(): Boolean = red - green > REDDISH && red - blue > REDDISH

    private fun Color.isNearWhite(): Boolean = red > NEAR && green > NEAR && blue > NEAR

    private fun Color.isNearBlack(): Boolean = red < 1f - NEAR && green < 1f - NEAR && blue < 1f - NEAR

    @Composable
    private fun fullRedMeter(isStale: Boolean, tintEnd: Color? = null) {
        Box(Modifier.testTag(TAG).width(200.dp)) {
            MeeshyMeter(value = 1.0, total = 1.0, label = "Quota", tint = Color.Red, tintEnd = tintEnd, size = MeeshyMeterSize.S12, isStale = isStale)
        }
    }

    @Test
    fun `une jauge vivante montre sa teinte`() {
        render { fullRedMeter(isStale = false) }

        assertThat(shot(TAG).all().count { it.isReddish() }).isGreaterThan(0)
    }

    @Test
    fun `une jauge perimee perd sa couleur a l'image, pas seulement dans sa recette`() {
        render { fullRedMeter(isStale = true) }

        assertThat(shot(TAG).all().count { it.isReddish() }).isEqualTo(0)
    }

    @Test
    fun `le degrade de la jauge part du bord de debut, a droite en arabe`() {
        render(direction = LayoutDirection.Rtl) { fullRedMeter(isStale = false, tintEnd = Color.Blue) }

        val image = shot(TAG)
        val y = image.bounds.center.y.toInt()
        val inset = image.bounds.height.toInt()
        val start = image.at(image.bounds.right.toInt() - inset, y)
        val end = image.at(image.bounds.left.toInt() + inset, y)
        assertThat(start.red).isGreaterThan(start.blue)
        assertThat(end.blue).isGreaterThan(end.red)
    }

    @Test
    fun `un medaillon en aplat porte une encre sombre en theme clair, jamais le blanc du theme`() {
        render {
            Box(Modifier.testTag(TAG).background(Color.Blue)) {
                MeeshyMedallion(icon = MeeshyIcons.CheckCircleFilled, tint = Color.Red, fill = MeeshyMedallionFill.Solid, size = MeeshyMedallionSize.S96)
            }
        }

        val pixels = shot(TAG).all()
        assertThat(pixels.count { it.isNearBlack() }).isGreaterThan(0)
        assertThat(pixels.count { it.isNearWhite() }).isEqualTo(0)
    }

    @Test
    fun `l'organique derive sans recomposer le medaillon a chaque image`() {
        var compositions = 0
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalReduceMotion provides false) {
                    MeeshyMedallion(
                        modifier = Modifier.composed {
                            compositions++
                            Modifier
                        },
                        icon = MeeshyIcons.CheckCircleFilled,
                        shape = MeeshyMedallionShape.Blob,
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(FRAME_MILLIS)
        val settled = compositions

        compose.mainClock.advanceTimeBy(ONE_SECOND)

        assertThat(compositions - settled).isAtMost(2)
    }

    @Test
    fun `en arabe la touche nomme la fleche qu'elle montre`() {
        render(direction = LayoutDirection.Rtl) {
            MeeshyKeyHint(listOf(MeeshyKey.Left), hasKeyboard = true, spokenPrefix = "raccourci")
        }

        val node = compose.onNodeWithContentDescription("raccourci", substring = true).fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.ContentDescription)).containsExactly("raccourci : Right arrow")
    }

    private companion object {
        const val TAG = "atome"
        const val REDDISH = 0.3f
        const val NEAR = 0.85f
        const val FRAME_MILLIS = 32L
        const val ONE_SECOND = 1_000L
    }
}
