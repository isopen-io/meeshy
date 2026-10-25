package me.meeshy.app.settings

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.e2ee.OwnEncryptedDevicesProviding
import me.meeshy.sdk.model.e2ee.EncryptedDevicePlatform
import me.meeshy.sdk.model.e2ee.OwnEncryptedDevice
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant

/** Ce que TalkBack et le doigt trouvent sur « Mes appareils chiffrés » (#13014). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EncryptedDevicesScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val tablet = OwnEncryptedDevice(
        deviceId = 2,
        registrationId = 102,
        platform = EncryptedDevicePlatform.IOS,
        label = null,
        enrolledAt = Instant.parse("2026-10-20T08:00:00Z"),
        lastSeenAt = Instant.parse("2026-10-25T09:30:00Z"),
        isCurrent = false,
    )
    private val laptop = tablet.copy(deviceId = 3, platform = EncryptedDevicePlatform.MACOS, label = "Bureau", isCurrent = true)

    private class Served(private val list: List<OwnEncryptedDevice>) : OwnEncryptedDevicesProviding {
        override val devices: StateFlow<List<OwnEncryptedDevice>?> = MutableStateFlow(list)
        override suspend fun refresh(): NetworkResult<List<OwnEncryptedDevice>> = NetworkResult.Success(list)
        override suspend fun retire(device: OwnEncryptedDevice): NetworkResult<Unit> = NetworkResult.Success(Unit)
    }

    private fun show(devices: List<OwnEncryptedDevice>) {
        val viewModel = EncryptedDevicesViewModel(Served(devices))
        compose.setContent { MeeshyTheme { EncryptedDevicesScreen(onBack = {}, viewModel = viewModel) } }
        compose.waitForIdle()
    }

    @Test
    fun `the screen says why this phone shows no code yet`() {
        show(listOf(tablet))

        compose.onNodeWithText("This Android phone doesn’t read end-to-end encrypted chats yet").assertExists()
    }

    @Test
    fun `an unnamed device is named by its platform and number, and removing it asks first`() {
        show(listOf(tablet))

        compose.onNodeWithText("iOS device 2").assertExists()
        compose.onNodeWithContentDescription("Remove iOS device 2").performClick()
        compose.waitForIdle()

        compose.onNodeWithText("Remove this device?").assertExists()
    }

    @Test
    fun `the device of this session is marked and offers no removal`() {
        show(listOf(laptop))

        compose.onNodeWithText("Bureau").assertExists()
        compose.onNodeWithText("This device").assertExists()
        compose.onNodeWithContentDescription("Remove Bureau").assertDoesNotExist()
    }

    @Test
    fun `no device is an empty state`() {
        show(emptyList())

        compose.onNodeWithText("No encrypted device yet").assertExists()
    }
}
