package me.meeshy.sdk.model.notification

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaPermissionState
import org.junit.Test

class NotificationPermissionPromptTest {

    @Test
    fun `on Android 13 and later a never-asked permission is asked once the account is open`() {
        assertThat(NotificationPermissionPrompt.asksOnArrival(sdkInt = 33, state = MediaPermissionState.NOT_DETERMINED, alreadyRequested = false))
            .isTrue()
        assertThat(NotificationPermissionPrompt.asksOnArrival(sdkInt = 36, state = MediaPermissionState.NOT_DETERMINED, alreadyRequested = false))
            .isTrue()
    }

    @Test
    fun `a permission already asked, granted or refused is never asked again at arrival`() {
        assertThat(NotificationPermissionPrompt.asksOnArrival(sdkInt = 36, state = MediaPermissionState.NOT_DETERMINED, alreadyRequested = true))
            .isFalse()
        assertThat(NotificationPermissionPrompt.asksOnArrival(sdkInt = 36, state = MediaPermissionState.GRANTED, alreadyRequested = false))
            .isFalse()
        assertThat(NotificationPermissionPrompt.asksOnArrival(sdkInt = 36, state = MediaPermissionState.DENIED, alreadyRequested = false))
            .isFalse()
    }

    @Test
    fun `before Android 13 there is no runtime permission to ask`() {
        assertThat(NotificationPermissionPrompt.asksOnArrival(sdkInt = 32, state = MediaPermissionState.NOT_DETERMINED, alreadyRequested = false))
            .isFalse()
    }

    @Test
    fun `the push switch shows on only when the preference and the system both allow it`() {
        assertThat(NotificationPermissionPrompt.pushSwitchOn(preferenceEnabled = true, systemAllows = true)).isTrue()
        assertThat(NotificationPermissionPrompt.pushSwitchOn(preferenceEnabled = true, systemAllows = false)).isFalse()
        assertThat(NotificationPermissionPrompt.pushSwitchOn(preferenceEnabled = false, systemAllows = true)).isFalse()
    }
}
