package me.meeshy.app.calls

import android.content.Context
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.call.CallAudioRoute
import me.meeshy.sdk.model.call.CallAudioRouteKind
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallAudioRouteViewModelTest {
    private val earpiece = CallAudioRoute(1, "", CallAudioRouteKind.Earpiece)
    private val speaker = CallAudioRoute(2, "", CallAudioRouteKind.Speaker)
    private val buds = CallAudioRoute(7, "Buds", CallAudioRouteKind.Bluetooth)

    private class FakeService(var snap: CallAudioRouteSnapshot, var accept: Boolean = true) : CallAudioRouteProviding {
        val changes = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
        override val routeChanges = changes
        override fun snapshot() = snap
        override fun select(id: Int) = accept
    }

    private val clock = object : CallClock { override fun nowMs() = 0L }
    private val bus = CallToastBus(clock)
    private val context: Context = mockk(relaxed = true) { every { getString(any()) } returns "fail" }

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private fun vm(service: FakeService, granted: Boolean = true) =
        CallAudioRouteViewModel(service, { granted }, bus, context)

    @Test
    fun `la sélection est optimiste puis confirmée`() {
        val service = FakeService(CallAudioRouteSnapshot(listOf(earpiece, speaker, buds), 1))
        val vm = vm(service)
        vm.onEvent(CallAudioRouteUiEvent.Start(isVideo = false))
        vm.onEvent(CallAudioRouteUiEvent.Select(7))
        assertThat(vm.state.value.route.activeId).isEqualTo(7)
    }

    @Test
    fun `un refus de la plateforme annule la sélection`() {
        val service = FakeService(CallAudioRouteSnapshot(listOf(earpiece, speaker, buds), 1), accept = false)
        val vm = vm(service)
        vm.onEvent(CallAudioRouteUiEvent.Start(isVideo = false))
        vm.onEvent(CallAudioRouteUiEvent.Select(7))
        assertThat(vm.state.value.route.activeId).isEqualTo(1)
    }

    @Test
    fun `le périphérique débranché ramène à l'écouteur`() {
        val service = FakeService(CallAudioRouteSnapshot(listOf(earpiece, speaker, buds), 7))
        val vm = vm(service)
        vm.onEvent(CallAudioRouteUiEvent.Start(isVideo = false))
        service.snap = CallAudioRouteSnapshot(listOf(earpiece, speaker), null)
        service.changes.tryEmit(Unit)
        assertThat(vm.state.value.route.activeId).isEqualTo(1)
    }

    @Test
    fun `sans permission les routes Bluetooth sont masquées`() {
        val service = FakeService(CallAudioRouteSnapshot(listOf(earpiece, speaker, buds), 1))
        val vm = vm(service, granted = false)
        vm.onEvent(CallAudioRouteUiEvent.Start(isVideo = false))
        assertThat(vm.state.value.route.bluetoothHidden).isTrue()
        vm.onEvent(CallAudioRouteUiEvent.BluetoothPermissionResult(true))
        assertThat(vm.state.value.route.visibleRoutes).contains(buds)
    }
}
