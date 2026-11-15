package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.e2ee.OwnEncryptedDevicesProviding
import me.meeshy.sdk.model.e2ee.EncryptedDevicePlatform
import me.meeshy.sdk.model.e2ee.OwnEncryptedDevice
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** Réglages › Sécurité › « Mes appareils chiffrés » (#13014). */
@OptIn(ExperimentalCoroutinesApi::class)
class EncryptedDevicesViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private fun device(id: Int, current: Boolean = false) = OwnEncryptedDevice(
        deviceId = id,
        registrationId = 100 + id,
        platform = EncryptedDevicePlatform.IOS,
        label = null,
        enrolledAt = Instant.parse("2026-10-20T08:00:00Z"),
        lastSeenAt = Instant.parse("2026-10-25T09:30:00Z"),
        isCurrent = current,
    )

    private val offline = NetworkResult.Failure(ApiError(message = "no route", code = "NETWORK"))
    private val broken = NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_500", httpStatus = 500))

    private class FakeDevices(
        cached: List<OwnEncryptedDevice>? = null,
        var served: () -> NetworkResult<List<OwnEncryptedDevice>> = { NetworkResult.Success(emptyList()) },
        var retireResult: () -> NetworkResult<Unit> = { NetworkResult.Success(Unit) },
    ) : OwnEncryptedDevicesProviding {
        val flow = MutableStateFlow(cached)
        val retired = mutableListOf<Int>()
        var refreshes = 0
        var retireGate: CompletableDeferred<Unit>? = null
        override val devices: StateFlow<List<OwnEncryptedDevice>?> = flow

        override suspend fun refresh(): NetworkResult<List<OwnEncryptedDevice>> {
            refreshes += 1
            return served().also { result -> if (result is NetworkResult.Success) flow.value = result.data }
        }

        override suspend fun retire(device: OwnEncryptedDevice): NetworkResult<Unit> {
            retired += device.deviceId
            retireGate?.await()
            return retireResult().also { result ->
                if (result is NetworkResult.Success) flow.value = flow.value?.filterNot { it.deviceId == device.deviceId }
            }
        }
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `a cold start shows a loader, then the served devices`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) })
        val vm = EncryptedDevicesViewModel(repo)

        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Loading)
        advanceUntilIdle()

        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Listed(listOf(device(1), device(2)), staleBecause = null))
    }

    @Test
    fun `a remembered list shows at once, with no loader, while it is reread`() = runTest(dispatcher) {
        val repo = FakeDevices(cached = listOf(device(1)), served = { NetworkResult.Success(listOf(device(1), device(3))) })
        val vm = EncryptedDevicesViewModel(repo)

        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Listed(listOf(device(1)), staleBecause = null))
        advanceUntilIdle()

        assertThat(repo.refreshes).isEqualTo(1)
        assertThat((vm.state.value.content() as EncryptedDevicesContent.Listed).devices.map { it.deviceId }).containsExactly(1, 3)
    }

    @Test
    fun `offline with nothing remembered says so and offers to retry`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { offline })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Unreachable(EncryptedDevicesFailure.OFFLINE))

        repo.served = { NetworkResult.Success(listOf(device(1))) }
        vm.refresh()
        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Loading)
        advanceUntilIdle()

        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Listed(listOf(device(1)), staleBecause = null))
    }

    @Test
    fun `offline or broken with a remembered list keeps it and marks it stale`() = runTest(dispatcher) {
        val offlineVm = EncryptedDevicesViewModel(FakeDevices(cached = listOf(device(1)), served = { offline }))
        val brokenVm = EncryptedDevicesViewModel(FakeDevices(cached = listOf(device(1)), served = { broken }))
        advanceUntilIdle()

        assertThat(offlineVm.state.value.content())
            .isEqualTo(EncryptedDevicesContent.Listed(listOf(device(1)), staleBecause = EncryptedDevicesFailure.OFFLINE))
        assertThat(brokenVm.state.value.content())
            .isEqualTo(EncryptedDevicesContent.Listed(listOf(device(1)), staleBecause = EncryptedDevicesFailure.UNAVAILABLE))
    }

    @Test
    fun `no device at all is an empty state, not an error`() = runTest(dispatcher) {
        val vm = EncryptedDevicesViewModel(FakeDevices(served = { NetworkResult.Success(emptyList()) }))
        advanceUntilIdle()

        assertThat(vm.state.value.content()).isEqualTo(EncryptedDevicesContent.Empty(staleBecause = null))
    }

    @Test
    fun `tapping remove only asks, and nothing is retired until confirmed`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(2))
        advanceUntilIdle()
        assertThat(vm.state.value.pendingRetirement).isEqualTo(device(2))
        assertThat(repo.retired).isEmpty()

        vm.confirmRetire()
        advanceUntilIdle()

        assertThat(repo.retired).containsExactly(2)
        assertThat(vm.state.value.pendingRetirement).isNull()
        assertThat((vm.state.value.content() as EncryptedDevicesContent.Listed).devices.map { it.deviceId }).containsExactly(1)
    }

    @Test
    fun `cancelling keeps the device, and a second confirmation sends nothing`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(2))
        vm.cancelRetire()
        vm.confirmRetire()
        advanceUntilIdle()

        assertThat(repo.retired).isEmpty()
        assertThat((vm.state.value.content() as EncryptedDevicesContent.Listed).devices).hasSize(2)
    }

    @Test
    fun `the device stays listed while the gateway has not confirmed its removal`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) })
        repo.retireGate = CompletableDeferred()
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(2))
        vm.confirmRetire()
        runCurrent()

        assertThat(vm.state.value.retiringIds).containsExactly(2)
        assertThat((vm.state.value.content() as EncryptedDevicesContent.Listed).devices.map { it.deviceId }).containsExactly(1, 2)

        repo.retireGate!!.complete(Unit)
        advanceUntilIdle()
        assertThat(vm.state.value.retiringIds).isEmpty()
    }

    @Test
    fun `the device of this session cannot be retired from here`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1, current = true))) })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(1, current = true))
        vm.confirmRetire()
        advanceUntilIdle()

        assertThat(vm.state.value.pendingRetirement).isNull()
        assertThat(repo.retired).isEmpty()
    }

    @Test
    fun `a failed removal keeps the device and says whether it was offline`() = runTest(dispatcher) {
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) }, retireResult = { offline })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(2))
        vm.confirmRetire()
        advanceUntilIdle()

        assertThat(vm.state.value.retireFailure).isEqualTo(EncryptedDevicesFailure.OFFLINE)
        assertThat(vm.state.value.retiringIds).isEmpty()
        assertThat((vm.state.value.content() as EncryptedDevicesContent.Listed).devices.map { it.deviceId }).containsExactly(1, 2)

        vm.dismissRetireFailure()
        assertThat(vm.state.value.retireFailure).isNull()
    }

    @Test
    fun `a remembered list can be read but not acted on until the gateway confirms it again`() = runTest(dispatcher) {
        val repo = FakeDevices(cached = listOf(device(1), device(2)), served = { offline })
        val vm = EncryptedDevicesViewModel(repo)

        vm.requestRetire(device(2))
        assertThat(vm.state.value.pendingRetirement).isNull()
        advanceUntilIdle()

        assertThat(vm.state.value.canRetire).isFalse()
        vm.requestRetire(device(2))
        assertThat(vm.state.value.pendingRetirement).isNull()

        repo.served = { NetworkResult.Success(listOf(device(1), device(2))) }
        vm.refresh()
        advanceUntilIdle()
        vm.requestRetire(device(2))

        assertThat(vm.state.value.pendingRetirement).isEqualTo(device(2))
    }

    @Test
    fun `a place taken over since the list was shown is said as such`() = runTest(dispatcher) {
        val changed = NetworkResult.Failure(ApiError(message = "changé", code = "E2EE_DEVICE_CHANGED", httpStatus = 409))
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) }, retireResult = { changed })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(2))
        vm.confirmRetire()
        advanceUntilIdle()

        assertThat(vm.state.value.retireFailure).isEqualTo(EncryptedDevicesFailure.CHANGED)
    }

    /**
     * #13039 — la passerelle n'a pas pu fermer la session de l'appareil (503
     * `E2EE_DEVICE_SESSION_NOT_CLOSED`) : rien n'est retiré, et l'écran le dit au lieu
     * d'une panne générique, l'appareil restant listé.
     */
    @Test
    fun `a session that could not be closed says nothing was removed`() = runTest(dispatcher) {
        val notClosed = NetworkResult.Failure(ApiError(message = "non fermée", code = "E2EE_DEVICE_SESSION_NOT_CLOSED", httpStatus = 503))
        val repo = FakeDevices(served = { NetworkResult.Success(listOf(device(1), device(2))) }, retireResult = { notClosed })
        val vm = EncryptedDevicesViewModel(repo)
        advanceUntilIdle()

        vm.requestRetire(device(2))
        vm.confirmRetire()
        advanceUntilIdle()

        assertThat(vm.state.value.retireFailure).isEqualTo(EncryptedDevicesFailure.SESSION_NOT_CLOSED)
        assertThat(vm.state.value.devices).contains(device(2))
    }
}
