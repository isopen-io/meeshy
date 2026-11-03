package me.meeshy.sdk.call

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.NetworkPathSnapshot
import me.meeshy.sdk.model.call.CallNetworkPath
import me.meeshy.sdk.network.InMemoryNetworkPathSource
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallNetworkPathMonitorTest {

    private class FakeDataSaver(var enabled: Boolean = false) : CallDataSaver {
        val flips = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        override fun isEnabled() = enabled
        override val changes = flips
    }

    private val wifi = NetworkPathSnapshot(isSatisfied = true, usesWifi = true)
    private val cellular = NetworkPathSnapshot(isSatisfied = true, isConstrained = true, usesCellular = true)

    @Test
    fun `the initial value is the known path, read before any change`() {
        val monitor = CallNetworkPathMonitor(InMemoryNetworkPathSource(cellular), FakeDataSaver())
        assertThat(monitor.current()).isEqualTo(CallNetworkPath(isExpensive = true, isConstrained = false))
    }

    @Test
    fun `an unmetered wifi path is unrestricted even with the data saver on`() {
        val monitor = CallNetworkPathMonitor(InMemoryNetworkPathSource(wifi), FakeDataSaver(enabled = true))
        assertThat(monitor.current()).isEqualTo(CallNetworkPath.UNRESTRICTED)
    }

    @Test
    fun `the data saver on a metered link is constrained`() {
        val monitor = CallNetworkPathMonitor(InMemoryNetworkPathSource(cellular), FakeDataSaver(enabled = true))
        assertThat(monitor.current()).isEqualTo(CallNetworkPath(isExpensive = true, isConstrained = true))
    }

    @Test
    fun `an offline device reads unrestricted, it has no profile to spend`() {
        val monitor = CallNetworkPathMonitor(InMemoryNetworkPathSource(NetworkPathSnapshot.OFFLINE), FakeDataSaver(enabled = true))
        assertThat(monitor.current()).isEqualTo(CallNetworkPath.UNRESTRICTED)
    }

    @Test
    fun `paths emit the initial value then each distinct change`() = runTest(UnconfinedTestDispatcher()) {
        val source = InMemoryNetworkPathSource(wifi)
        val saver = FakeDataSaver()
        val monitor = CallNetworkPathMonitor(source, saver)
        val seen = mutableListOf<CallNetworkPath>()
        val job = launch { monitor.paths.toList(seen) }

        source.publish(cellular)
        saver.enabled = true
        saver.flips.emit(Unit)
        source.publish(wifi.copy(usesWifi = true))
        job.cancel()

        assertThat(seen).containsExactly(
            CallNetworkPath.UNRESTRICTED,
            CallNetworkPath(isExpensive = true, isConstrained = false),
            CallNetworkPath(isExpensive = true, isConstrained = true),
            CallNetworkPath.UNRESTRICTED,
        ).inOrder()
    }

    @Test
    fun `the android data saver reads the system status and follows the broadcast`() = runTest(UnconfinedTestDispatcher()) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val connectivity = mockk<ConnectivityManager>()
        every { connectivity.restrictBackgroundStatus } returns ConnectivityManager.RESTRICT_BACKGROUND_STATUS_DISABLED
        val saver = AndroidCallDataSaver(context, connectivity)
        assertThat(saver.isEnabled()).isFalse()

        var changes = 0
        val job = launch { saver.changes.collect { changes++ } }
        every { connectivity.restrictBackgroundStatus } returns ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
        context.sendBroadcast(Intent(ConnectivityManager.ACTION_RESTRICT_BACKGROUND_CHANGED))
        shadowOf(android.os.Looper.getMainLooper()).idle()

        assertThat(saver.isEnabled()).isTrue()
        assertThat(changes).isEqualTo(1)
        job.cancel()
    }
}
