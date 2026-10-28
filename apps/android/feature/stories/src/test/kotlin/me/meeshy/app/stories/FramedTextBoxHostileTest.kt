package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Une story publiée par un tiers est une donnée non fiable : son cadre se met en page sans jamais lever (#13578). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FramedTextBoxHostileTest {
    @get:Rule
    val compose = createComposeRule()

    private val pxPerDesign = mutableFloatStateOf(1f)

    private fun showBox(frame: StoryTextFrame = StoryTextFrame(shape = StoryTextFrameShape.CLOUD)) {
        compose.setContent {
            Box(Modifier.size(360.dp, 640.dp)) {
                FramedTextBox(
                    background = StoryTextBackground.Solid("FF0000"),
                    frame = frame,
                    pxPerDesign = pxPerDesign.floatValue,
                    glyphStyle = TextStyle(fontSize = 20.sp),
                    modifier = Modifier.testTag("box"),
                ) { Text("Bonjour", fontSize = 20.sp) }
            }
        }
    }

    @Test
    fun `a non finite or absurd design pixel lays out inside the scene without throwing`() {
        showBox()
        listOf(1f, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY, 0f, -3f, 1e30f, 1e9f, 40f).forEach { k ->
            pxPerDesign.floatValue = k
            compose.waitForIdle()
            val bounds = compose.onNodeWithTag("box").getBoundsInRoot()
            assertThat(bounds.right.value).isAtMost(360f + 0.5f)
            assertThat(bounds.bottom.value).isAtMost(640f + 0.5f)
        }
    }

    @Test
    fun `a hostile published text plays in the reader without throwing`() {
        val hostile = StoryTextObjectProjection.project(
            StoryTextObject(
                id = "t", text = "Bonjour", scale = 1e30, textBg = "FF0000", frameShape = "speech",
                frameBorderWidth = 1e9, frameBorderColor = "FFFFFF", framePaddingScale = 1e9,
            ),
            preferredLanguages = emptyList(),
        )
        compose.setContent {
            Box(Modifier.size(360.dp, 640.dp)) {
                StoryTextObjectLayer(textObject = hostile, playheadSeconds = 0f, modifier = Modifier.testTag("layer"))
            }
        }
        compose.waitForIdle()
        compose.onNodeWithTag("layer").assertExists()
    }
}
