package me.meeshy.ui.component.kit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * K02 — un changement de tenue est un fondu enchaîné, dans les deux sens : le glyphe reste peint à pleine opacité
 * pendant que le verre qui revient se fond dessous. Miroir de `MeeshyGlassButton.swift` (animation sur `recipe.kind`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeshyGlassButtonCrossfadeTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun glyphCenter(): Color {
        val bounds = compose.onNodeWithTag(FACE).fetchSemanticsNode().boundsInRoot
        val root = compose.activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { root.draw(Canvas(bitmap)) }
        return Color(bitmap.getPixel(bounds.center.x.toInt(), bounds.center.y.toInt()))
    }

    private fun assertGlyphFullyPainted(painted: Color) {
        assertThat(painted.red).isGreaterThan(0.9f)
        assertThat(painted.green).isLessThan(0.1f)
        assertThat(painted.blue).isLessThan(0.1f)
    }

    @Test
    fun `le glyphe ne clignote pas quand le bouton quitte une tenue pleine pour redevenir normal`() {
        var kind by mutableStateOf(MeeshyGlassButtonKind.Active)
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.background(Color.White)) {
                    MeeshyGlassButtonFace(modifier = Modifier.testTag(FACE), kind = kind) { glyphSize ->
                        Box(Modifier.size(glyphSize).background(Color.Red))
                    }
                }
            }
        }
        compose.waitForIdle()
        assertGlyphFullyPainted(glyphCenter())

        compose.mainClock.autoAdvance = false
        kind = MeeshyGlassButtonKind.Normal
        repeat(MeeshyGlassRecipe.TONE_FADE_MILLIS / SAMPLE_MILLIS.toInt()) {
            compose.mainClock.advanceTimeBy(SAMPLE_MILLIS)
            assertGlyphFullyPainted(glyphCenter())
        }

        compose.mainClock.advanceTimeBy(MeeshyGlassRecipe.TONE_FADE_MILLIS.toLong() + 100L)
        assertGlyphFullyPainted(glyphCenter())
    }

    private companion object {
        const val FACE = "face"
        const val SAMPLE_MILLIS = 25L
    }
}
