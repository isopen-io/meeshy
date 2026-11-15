package me.meeshy.app.stories

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.down
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.moveBy
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
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
class StoryGroupCubeComposeTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private class Harness(val hasNext: Boolean = true, val hasPrevious: Boolean = true) {
        lateinit var motion: StoryCardMotion
        val commits = mutableListOf<StorySwipeAction>()
        val offsetsAtCommit = mutableListOf<Float>()
    }

    private fun mount(harness: Harness) {
        compose.setContent {
            val motion = rememberStoryCardMotion()
            harness.motion = motion
            val scope = rememberCoroutineScope()
            val next = rememberUpdatedState(harness.hasNext)
            val previous = rememberUpdatedState(harness.hasPrevious)
            val surface = rememberUpdatedState(false)
            val composer = rememberUpdatedState(false)
            Box(
                Modifier
                    .fillMaxSize()
                    .testTag(TAG)
                    .storyDragLayer(
                        motion = motion,
                        scope = scope,
                        frames = StoryDragFrameSource(),
                        reactionBar = { null },
                        hasNextGroup = next,
                        hasPreviousGroup = previous,
                        surfaceOpen = surface,
                        composerEngaged = composer,
                        onDismissSurfaces = {},
                        onCommit = {
                            harness.offsetsAtCommit += motion.offsetX.value
                            harness.commits += it
                        },
                        onCommitFeedback = {},
                    ),
            )
        }
    }

    @Test
    fun `un glissé gauche au-delà de la moitié monte le voisin, tourne jusqu'au bout puis échange le contenu à plat`() {
        val harness = Harness()
        mount(harness)
        compose.onNodeWithTag(TAG).performTouchInput {
            down(center)
            moveBy(Offset(-100f, 0f))
            moveBy(Offset(-600f, 0f))
        }
        compose.waitForIdle()
        assertThat(harness.motion.cubeNeighborsMounted).isTrue()
        assertThat(harness.motion.offsetX.value).isLessThan(0f)

        compose.onNodeWithTag(TAG).performTouchInput { up() }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(2_000)
        assertThat(harness.commits).containsExactly(StorySwipeAction.NextGroup)
        assertThat(harness.offsetsAtCommit.single()).isLessThan(-1000f)
        assertThat(harness.motion.offsetX.value).isEqualTo(0f)
        assertThat(harness.motion.transitioning).isFalse()
        assertThat(harness.motion.cubeNeighborsMounted).isFalse()
    }

    @Test
    fun `un glissé court revient en ressort amorti sans jamais passer du côté opposé`() {
        val harness = Harness()
        mount(harness)
        compose.onNodeWithTag(TAG).performTouchInput {
            down(center)
            moveBy(Offset(-100f, 0f))
            moveBy(Offset(-150f, 0f))
            up()
        }
        compose.waitForIdle()
        val seen = mutableListOf<Float>()
        repeat(40) {
            compose.mainClock.advanceTimeBy(16)
            seen += harness.motion.offsetX.value
        }
        compose.mainClock.advanceTimeBy(2_000)
        assertThat(harness.commits).isEmpty()
        assertThat(seen.all { it <= 0.5f }).isTrue()
        assertThat(harness.motion.offsetX.value).isWithin(0.5f).of(0f)
        assertThat(harness.motion.cubeNeighborsMounted).isFalse()
    }

    @Test
    fun `sans groupe suivant la carte résiste en butée et ne commit pas`() {
        val harness = Harness(hasNext = false)
        mount(harness)
        compose.onNodeWithTag(TAG).performTouchInput {
            down(center)
            moveBy(Offset(-100f, 0f))
            moveBy(Offset(-900f, 0f))
        }
        compose.waitForIdle()
        assertThat(harness.motion.offsetX.value).isGreaterThan(-1080f * StoryGroupSwipeDecision.EDGE_RESISTANCE_IN_WIDTHS - 1f)
        compose.onNodeWithTag(TAG).performTouchInput { up() }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(2_000)
        assertThat(harness.commits).isEmpty()
        assertThat(harness.motion.offsetX.value).isWithin(0.5f).of(0f)
    }

    private companion object {
        const val TAG = "cube-drag"
    }
}
