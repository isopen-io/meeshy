package me.meeshy.app.stories

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.sdk.model.scene.StoryElementTiming
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** TalkBack annonce si le départ et la durée sont posés, et leur valeur (#13583). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TimingCycleButtonsSemanticsTest {
    @get:Rule
    val compose = createComposeRule()

    private val timing = mutableStateOf(StoryElementTiming())

    private fun stateOf(label: String, expected: String) =
        compose.onNodeWithContentDescription(label).assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, expected))

    @Test
    fun `an unset start and duration are announced as not set, a set one by its seconds`() {
        compose.setContent { TimingCycleButtons(timing.value, onCycleStart = {}, onCycleDuration = {}) }
        stateOf("Text start time", "Not set")
        stateOf("Text visible duration", "Not set")

        timing.value = StoryElementTiming(startSeconds = 2f, durationSeconds = 0.5f)
        compose.waitForIdle()
        stateOf("Text start time", "2 s")
        stateOf("Text visible duration", "0.5 s")
    }
}
