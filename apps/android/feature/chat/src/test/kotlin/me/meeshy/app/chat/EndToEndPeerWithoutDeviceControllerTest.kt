package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.e2ee.libsignal.EndToEndPeerDeviceReach
import me.meeshy.sdk.e2ee.libsignal.EndToEndReadableRedirect
import me.meeshy.sdk.e2ee.libsignal.EndToEndRedirected
import org.junit.Test

/**
 * #20076 (iOS #20074) — au-dessus du compositeur d'un tête-à-tête chiffré dont le pair n'a aucun appareil chiffré : la
 * phrase qui le dit, et « Écrire sans chiffrement » qui ouvre le tête-à-tête lisible. Un envoi redirigé l'ouvre aussi.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EndToEndPeerWithoutDeviceControllerTest {

    private class FakeHost(override val scope: CoroutineScope, val ui: MutableStateFlow<ChatUiState>) : ChatControllerHost {
        override val conversationId = "sealed"
        override val uiState: StateFlow<ChatUiState> = ui
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private fun sealedDirect(isOffline: Boolean = false) = ChatUiState(
        conversationId = "sealed",
        conversationTitle = "Alice Martin",
        directPeerUserId = "peer",
        encryptionMode = "e2ee",
        isOffline = isOffline,
    )

    private class Rig(devices: Int, openTo: String? = "readable") {
        var count = devices
        val reach = EndToEndPeerDeviceReach { count }
        val events = MutableSharedFlow<EndToEndRedirected>(extraBufferCapacity = 4)
        val redirect = mockk<EndToEndReadableRedirect> {
            every { redirected } returns events
            coEvery { open("sealed", "peer") } returns openTo
        }
        val controller = EndToEndPeerWithoutDeviceController(reach, redirect)
    }

    @Test
    fun `a peer known without device shows the banner with the peer's first name`() = runTest {
        val rig = Rig(devices = 0)
        rig.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect())))
        runCurrent()

        assertThat(rig.controller.banner.value).isEqualTo(PeerWithoutDeviceBanner(peerFirstName = "Alice", isOpening = false))
    }

    @Test
    fun `a peer with a device, or a readable conversation, shows nothing`() = runTest {
        val withDevice = Rig(devices = 1)
        withDevice.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect())))
        val readable = Rig(devices = 0)
        readable.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect().copy(encryptionMode = "server"))))
        runCurrent()

        assertThat(withDevice.controller.banner.value).isNull()
        assertThat(readable.controller.banner.value).isNull()
    }

    @Test
    fun `writing without encryption opens the readable direct`() = runTest {
        val rig = Rig(devices = 0)
        rig.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect())))
        val opened = mutableListOf<String>()
        backgroundScope.launch { rig.controller.openRequests.collect { opened += it } }
        runCurrent()

        rig.controller.writePlain()
        runCurrent()

        assertThat(opened).containsExactly("readable")
        assertThat(rig.controller.banner.value?.isOpening).isFalse()
    }

    @Test
    fun `an opening that fails, or offline, says so and opens nothing`() = runTest {
        val failing = Rig(devices = 0, openTo = null)
        failing.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect())))
        val offline = Rig(devices = 0)
        offline.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect(isOffline = true))))
        val notices = mutableListOf<PeerWithoutDeviceNotice>()
        backgroundScope.launch { failing.controller.notices.collect { notices += it } }
        backgroundScope.launch { offline.controller.notices.collect { notices += it } }
        runCurrent()

        failing.controller.writePlain()
        offline.controller.writePlain()
        runCurrent()

        assertThat(notices).containsExactly(PeerWithoutDeviceNotice.OPEN_FAILED, PeerWithoutDeviceNotice.OFFLINE)
        coVerify(exactly = 0) { offline.redirect.open(any(), any()) }
    }

    @Test
    fun `a send redirected from this conversation opens the readable direct, one from elsewhere does not`() = runTest {
        val rig = Rig(devices = 1)
        rig.controller.attach(FakeHost(backgroundScope, MutableStateFlow(sealedDirect())))
        val opened = mutableListOf<String>()
        backgroundScope.launch { rig.controller.openRequests.collect { opened += it } }
        runCurrent()

        rig.events.emit(EndToEndRedirected("other", "x"))
        rig.events.emit(EndToEndRedirected("sealed", "readable"))
        runCurrent()

        assertThat(opened).containsExactly("readable")
    }
}
