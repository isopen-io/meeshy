package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13397 : avec une grande police, un nom qui a la place ne se tronque pas à la moitié de la rangée. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationRowTitleLineFontScaleTest {

    @get:Rule
    val compose = createComposeRule()

    private fun nameWidthAt(fontScale: Float, title: String): Float {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                MeeshyTheme {
                    Box(Modifier.width(300.dp)) {
                        ConversationRowTitleLine(
                            title = title,
                            isPinned = false,
                            isMuted = false,
                            isLocked = false,
                            reaction = null,
                            tags = emptyList(),
                            unreadCount = 0,
                            accent = Color.Red,
                            onJoinCall = null,
                        )
                    }
                }
            }
        }
        val bounds = compose.onNodeWithText(title).getUnclippedBoundsInRoot()
        return bounds.right.value - bounds.left.value
    }

    @Test
    fun `a long name uses the room the empty right half leaves, at font scale 1_3 and 2_0`() {
        val title = "Fatimasalamatu et toute la famille élargie"

        assertThat(nameWidthAt(1.3f, title)).isGreaterThan(200f)
    }

    @Test
    fun `a long name uses the room at font scale 2_0`() {
        val title = "Fatimasalamatu et toute la famille élargie"

        assertThat(nameWidthAt(2.0f, title)).isGreaterThan(200f)
    }
}
