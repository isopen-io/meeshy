package me.meeshy.app.stories

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.down
import androidx.compose.ui.test.moveBy
import androidx.compose.ui.test.cancel
import androidx.compose.ui.test.up
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryDragLayerTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private class Harness {
        lateinit var motion: StoryCardMotion
        val commits = mutableListOf<StorySwipeAction>()
        var surfaceDismissals = 0
        var surfaceOpen = false
        val frames = StoryDragFrameSource()
    }

    private fun mount(harness: Harness) {
        compose.setContent {
            val motion = rememberStoryCardMotion()
            harness.motion = motion
            val scope = rememberCoroutineScope()
            val next = rememberUpdatedState(true)
            val previous = rememberUpdatedState(true)
            val surface = rememberUpdatedState(harness.surfaceOpen)
            val composer = rememberUpdatedState(false)
            Box(
                Modifier
                    .fillMaxSize()
                    .testTag(TAG)
                    .storyDragLayer(
                        motion = motion,
                        scope = scope,
                        frames = harness.frames,
                        reactionBar = { null },
                        hasNextGroup = next,
                        hasPreviousGroup = previous,
                        surfaceOpen = surface,
                        composerEngaged = composer,
                        onDismissSurfaces = { harness.surfaceDismissals++ },
                        onCommit = { harness.commits += it },
                        onCommitFeedback = {},
                    ),
            )
        }
    }

    @Test
    fun `un glissé annulé à mi-geste ramène la carte et libère le suivi`() {
        val harness = Harness()
        mount(harness)
        compose.onNodeWithTag(TAG).performTouchInput {
            down(center)
            moveBy(Offset(0f, 200f))
        }
        compose.waitForIdle()
        assertThat(harness.motion.dragY.value).isGreaterThan(0f)
        assertThat(harness.motion.dragging).isTrue()

        compose.onNodeWithTag(TAG).performTouchInput { cancel() }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(2_000)
        assertThat(harness.motion.dragY.value).isWithin(0.5f).of(0f)
        assertThat(harness.motion.dragging).isFalse()
        assertThat(harness.motion.tracker.isInFlight).isFalse()
        assertThat(harness.commits).isEmpty()
    }

    @Test
    fun `un glissé haut franchissant le seuil passe en plein écran sans fermer`() {
        val harness = Harness()
        mount(harness)
        compose.onNodeWithTag(TAG).performTouchInput {
            down(center)
            moveBy(Offset(0f, -200f))
            moveBy(Offset(0f, -300f))
            up()
        }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(2_000)
        assertThat(harness.motion.fullscreen.enabled).isTrue()
        assertThat(harness.commits).isEmpty()
    }

    @Test
    fun `un glissé bas sur une surface ouverte la ferme sans fermer la story`() {
        val harness = Harness().also { it.surfaceOpen = true }
        mount(harness)
        compose.onNodeWithTag(TAG).performTouchInput {
            down(center)
            moveBy(Offset(0f, 200f))
            moveBy(Offset(0f, 300f))
            up()
        }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(2_000)
        assertThat(harness.surfaceDismissals).isEqualTo(1)
        assertThat(harness.commits).isEmpty()
    }

    private companion object {
        const val TAG = "dragLayer"
    }
}
