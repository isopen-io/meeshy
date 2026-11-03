package me.meeshy.app.calls

import android.content.Context
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallVideoFallback
import me.meeshy.ui.component.FeedbackKind
import org.junit.Test

class CallVideoFallbackAnnouncerTest {

    private class Rig {
        val context: Context = mockk(relaxed = true) { every { getString(any()) } returns "Camera: access denied" }
        val haptics: CallHaptics = mockk(relaxed = true)
        val toasts = CallToastBus(object : CallClock {
            override fun nowMs(): Long = 0L
        })
        val announcer = AndroidCallVideoFallbackAnnouncer(context, toasts, haptics)
    }

    @Test
    fun `a refused camera tells the user with a tappable error toast`() = runTest {
        val rig = Rig()

        rig.announcer.announce(CallVideoFallback.CameraPermissionDenied)

        val toast = rig.toasts.toasts.first()
        assertThat(toast.message).isEqualTo("Camera: access denied")
        assertThat(toast.kind).isEqualTo(FeedbackKind.Error)
        assertThat(toast.onTap).isNotNull()
        verify { rig.haptics.play(CallHapticKind.Warning) }
    }

    @Test
    fun `a missing camera is not the user's to fix and says nothing`() {
        val rig = Rig()

        rig.announcer.announce(CallVideoFallback.NoCamera)

        verify(exactly = 0) { rig.haptics.play(any()) }
        assertThat(rig.toasts.post(CallToast("Camera: access denied"))).isTrue()
    }

    @Test
    fun `a device too hot warns without offering the settings`() = runTest {
        val rig = Rig()

        rig.announcer.announce(CallVideoFallback.DeviceTooHot)

        val toast = rig.toasts.toasts.first()
        assertThat(toast.onTap).isNull()
        verify { rig.haptics.play(CallHapticKind.Warning) }
    }
}
