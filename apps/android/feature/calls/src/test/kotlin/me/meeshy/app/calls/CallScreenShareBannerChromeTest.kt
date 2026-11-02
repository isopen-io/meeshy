package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La bannière « X partage son écran » s'efface avec les commandes de l'appel, comme iOS (#13736). */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallScreenShareBannerChromeTest {
    @get:Rule val rule = createComposeRule()

    private fun overlay(): CallScreenShareBannerOverlay {
        val launcher = object : MediaProjectionServiceLauncher {
            override fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted) = Unit
            override fun stop() = Unit
        }
        val controller = CallScreenShareController(
            projections = MediaProjectionSession(launcher),
            media = object : CallScreenShareMedia {
                override fun begin(projection: android.media.projection.MediaProjection) = Unit
                override fun end() = Unit
            },
            announcer = { _, _ -> },
            reportFailure = {},
            socketConnected = MutableStateFlow(true),
            scope = CoroutineScope(UnconfinedTestDispatcher()),
        )
        return CallScreenShareBannerOverlay(controller)
    }

    private fun peerSharing() = CallUiState(
        status = CallStatus.CONNECTED,
        peerName = "Bob",
        isVideoCall = true,
        isMuted = false,
        isCameraOn = true,
        isSpeakerOn = true,
        endReason = null,
        reconnectAttempt = 0,
        durationLabel = null,
        showsConnectedLayout = true,
        isPeerScreenSharing = true,
    )

    @Test
    fun `the banner goes with the chrome and comes back with it`() {
        val banner = overlay()
        var chrome by mutableStateOf(CallChromeVisibility())
        rule.setContent {
            MeeshyTheme { banner.Content(CallOverlayContext(peerSharing(), Color.Black, chrome = chrome)) }
        }
        rule.onNodeWithText("Bob is sharing their screen").assertIsDisplayed()

        rule.runOnIdle { chrome = chrome.toggled() }
        rule.mainClock.advanceTimeBy(CallChromeVisibility.FADE_DURATION_MILLIS * 2)
        rule.waitForIdle()
        rule.onNodeWithText("Bob is sharing their screen").assertDoesNotExist()

        rule.runOnIdle { chrome = chrome.toggled() }
        rule.waitForIdle()
        rule.onNodeWithText("Bob is sharing their screen").assertIsDisplayed()
    }
}
