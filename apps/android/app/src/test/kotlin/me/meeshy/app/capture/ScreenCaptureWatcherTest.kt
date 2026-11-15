package me.meeshy.app.capture

import android.os.Build
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ScreenCaptureWatcherTest {

    private class Platform {
        var registered = 0
        var unregistered = 0
        var fire: (() -> Unit)? = null
        val registration = ScreenCaptureRegistration { onCapture ->
            registered++
            fire = onCapture
            return@ScreenCaptureRegistration { unregistered++ }
        }
    }

    private fun owner(): Pair<LifecycleOwner, LifecycleRegistry> {
        lateinit var registry: LifecycleRegistry
        val owner = object : LifecycleOwner {
            override val lifecycle: Lifecycle get() = registry
        }
        registry = LifecycleRegistry.createUnsafe(owner)
        return owner to registry
    }

    @Test
    fun `the callback is registered on start and removed on stop`() {
        val platform = Platform()
        val (owner, registry) = owner()
        registry.addObserver(ScreenCaptureWatcher(platform.registration, sdkInt = Build.VERSION_CODES.UPSIDE_DOWN_CAKE))

        registry.currentState = Lifecycle.State.STARTED
        assertThat(platform.registered).isEqualTo(1)
        registry.currentState = Lifecycle.State.CREATED
        assertThat(platform.unregistered).isEqualTo(1)
        registry.currentState = Lifecycle.State.STARTED
        assertThat(platform.registered).isEqualTo(2)
        assertThat(owner.lifecycle.currentState).isEqualTo(Lifecycle.State.STARTED)
    }

    @Test
    fun `a screenshot is emitted while visible`() = runTest {
        val platform = Platform()
        val (_, registry) = owner()
        val watcher = ScreenCaptureWatcher(platform.registration, sdkInt = 34)
        registry.addObserver(watcher)
        registry.currentState = Lifecycle.State.STARTED

        watcher.captures.test {
            platform.fire!!.invoke()
            awaitItem()
        }
    }

    @Test
    fun `below API 34 detection is absent and nothing is registered`() {
        val platform = Platform()
        val (_, registry) = owner()
        val watcher = ScreenCaptureWatcher(platform.registration, sdkInt = 33)
        registry.addObserver(watcher)

        registry.currentState = Lifecycle.State.STARTED

        assertThat(watcher.isDetectionAvailable).isFalse()
        assertThat(platform.registered).isEqualTo(0)
    }
}
