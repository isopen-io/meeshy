package me.meeshy.ui.component.scene

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneClockTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `publier la tete de lecture ne recompose pas le parent`() {
        val clock = SceneClock()
        var compositions = 0
        compose.setContent {
            compositions++
            Box(Modifier.size(10.dp).drawWithSceneClock(clock) { })
        }
        repeat(60) { tick -> compose.runOnIdle { clock.publish(tick / 60.0) } }
        compose.waitForIdle()
        assertThat(compositions).isEqualTo(1)
        assertThat(clock.seconds).isWithin(1e-9).of(59 / 60.0)
    }

    @Test
    fun `une valeur invalide est ignoree`() {
        val clock = SceneClock(2.0)
        clock.publish(Double.NaN)
        clock.publish(-1.0)
        assertThat(clock.seconds).isEqualTo(2.0)
        clock.reset()
        assertThat(clock.seconds).isEqualTo(0.0)
    }
}
