package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RetentionWorkerTest {

    @Test
    fun `la requete attend l'appareil au repos, quotidienne`() {
        val spec = RetentionWorker.buildRequest().workSpec

        assertThat(spec.constraints.requiresDeviceIdle()).isTrue()
        assertThat(spec.constraints.requiresBatteryNotLow()).isTrue()
        assertThat(spec.intervalDuration).isEqualTo(TimeUnit.DAYS.toMillis(1))
    }

    @Test
    fun `le lancement ne fait que planifier`() = runTest {
        var scheduled = 0
        val hook: AppLifecycleHook = RetentionHook(object : RetentionScheduler { override fun schedule() { scheduled++ } })

        hook.onAppCreate()

        assertThat(scheduled).isEqualTo(1)
    }
}
