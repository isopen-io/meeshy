package me.meeshy.ui.component.media

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaTrimStripGestureTest {

    @get:Rule
    val compose = createComposeRule()

    private val published = mutableListOf<MediaTrimBounds>()
    private var commits = 0

    private fun show(initial: MediaTrimBounds = MediaTrimBounds(0.0, 10.0)) {
        compose.setContent {
            var bounds by remember { mutableStateOf(initial) }
            MeeshyTheme {
                Box(Modifier.width(300.dp)) {
                    MediaTrimStrip(
                        content = MediaTrimContent.AUDIO,
                        sourceDuration = 10.0,
                        bounds = bounds,
                        accent = Color(0xFF6366F1),
                        waveform = List(40) { 0.5f },
                        onChange = { bounds = it; published += it },
                        onCommit = { commits++ },
                    )
                }
            }
        }
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteraction.dragSteps(stepPx: Float) {
        performTouchInput {
            down(center)
            repeat(20) { moveBy(Offset(stepPx, 0f)) }
            up()
        }
    }

    @Test
    fun `les poignees offrent une cible de 48 dp`() {
        show()
        listOf(MEDIA_TRIM_START_HANDLE_TAG, MEDIA_TRIM_END_HANDLE_TAG).forEach {
            compose.onNodeWithTag(it).assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `tirer la poignee de gauche publie des bornes a chaque image sans jamais croiser la droite`() {
        show(MediaTrimBounds(0.0, 6.0))
        compose.onNodeWithTag(MEDIA_TRIM_START_HANDLE_TAG).dragSteps(15f)
        compose.waitForIdle()
        assertThat(published.size).isGreaterThan(1)
        assertThat(published.map { it.start }).isInOrder()
        assertThat(published.last().start).isWithin(1e-9).of(6.0 - MediaTrimRule.MINIMUM_DURATION)
        assertThat(published.all { it.end == 6.0 }).isTrue()
        assertThat(commits).isEqualTo(1)
    }

    @Test
    fun `tirer la poignee de droite vers la gauche publie des bornes decroissantes`() {
        show(MediaTrimBounds(2.0, 10.0))
        compose.onNodeWithTag(MEDIA_TRIM_END_HANDLE_TAG).dragSteps(-15f)
        compose.waitForIdle()
        assertThat(published.size).isGreaterThan(1)
        assertThat(published.map { it.end }).isInOrder(Comparator.reverseOrder<Double>())
        assertThat(published.last().end).isWithin(1e-9).of(2.0 + MediaTrimRule.MINIMUM_DURATION)
        assertThat(published.all { it.start == 2.0 }).isTrue()
    }
}
