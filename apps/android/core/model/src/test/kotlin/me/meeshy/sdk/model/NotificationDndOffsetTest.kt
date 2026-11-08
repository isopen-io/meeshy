package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationDndOffsetTest {

    @Test
    fun `a write stamps the offset of the device at that moment`() {
        val stamped = UserNotificationPreferences(dndUtcOffsetMinutes = 60).withDeviceUtcOffset(540)

        assertThat(stamped.dndUtcOffsetMinutes).isEqualTo(540)
    }

    @Test
    fun `a negative offset is kept as is`() {
        assertThat(UserNotificationPreferences().withDeviceUtcOffset(-240).dndUtcOffsetMinutes).isEqualTo(-240)
    }

    @Test
    fun `an unchanged offset returns the very same block`() {
        val prefs = UserNotificationPreferences(dndUtcOffsetMinutes = 120)

        assertThat(prefs.withDeviceUtcOffset(120)).isSameInstanceAs(prefs)
    }

    @Test
    fun `stamping touches nothing else`() {
        val prefs = UserNotificationPreferences(pushEnabled = false, dndEnabled = true)

        val stamped = prefs.withDeviceUtcOffset(30)

        assertThat(stamped.copy(dndUtcOffsetMinutes = prefs.dndUtcOffsetMinutes)).isEqualTo(prefs)
    }
}
