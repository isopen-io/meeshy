package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13682 : la bulle d'humeur de « Votre story » déborde du cercle de l'avatar ; elle ne doit pas être
 * rognée par ce cercle (le fond rond ne clippe que lui-même, pas ses enfants).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTrayAddBadgeNotClippedTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `la bulle d humeur de Votre story n est pas rognee par le cercle de l avatar`() {
        compose.setContent {
            me.meeshy.ui.theme.MeeshyTheme { Box(Modifier.background(Color.Red)) {
                StoryTrayRail(
                    tray = StoryTrayBuilder.build(emptyList(), "me", null, 0L),
                    moodEmojiOf = { null },
                    onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
                    onAddStatus = {},
                )
            } }
        }
        compose.waitForIdle()
        val bounds = compose.onNodeWithContentDescription("Change my mood").getBoundsInRoot()
        val density = compose.density.density
        val bx = bounds.left.value + bounds.width.value / 2f
        val by = bounds.top.value + bounds.height.value / 2f
        val cx = bx * density
        val cy = by * density
        val probe = 11f * density
        val content = compose.activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0)
        val bitmap = android.graphics.Bitmap.createBitmap(content.width, content.height, android.graphics.Bitmap.Config.ARGB_8888)
        content.draw(android.graphics.Canvas(bitmap))
        val pixel = bitmap.getPixel((cx + probe).toInt(), (cy + probe).toInt())
        assertThat(pixel).isNotEqualTo(Color.Red.toArgb())
    }
}
