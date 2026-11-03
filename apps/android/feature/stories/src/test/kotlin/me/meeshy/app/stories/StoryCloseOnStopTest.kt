package me.meeshy.app.stories

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryCloseOnStopTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `passer en arriere-plan emet la fermeture une fois`() {
        var closed = 0
        lateinit var registry: LifecycleRegistry
        val owner = object : LifecycleOwner {
            override val lifecycle: Lifecycle get() = registry
        }
        registry = LifecycleRegistry.createUnsafe(owner)
        registry.currentState = Lifecycle.State.RESUMED
        compose.setContent {
            CompositionLocalProvider(LocalLifecycleOwner provides owner) { StoryCloseOnStop { closed++ } }
        }
        compose.waitForIdle()
        assertThat(closed).isEqualTo(0)

        compose.runOnUiThread { registry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE) }
        assertThat(closed).isEqualTo(0)
        compose.runOnUiThread { registry.handleLifecycleEvent(Lifecycle.Event.ON_STOP) }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(1)
    }
}
