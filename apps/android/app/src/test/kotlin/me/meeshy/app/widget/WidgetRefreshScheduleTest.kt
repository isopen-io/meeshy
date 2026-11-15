package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WidgetRefreshScheduleTest {

    @Test
    fun `signed in with unread conversations refreshes every 30 minutes`() {
        assertThat(WidgetRefreshSchedule.intervalMinutes(signedIn = true, hasUnread = true)).isEqualTo(30)
    }

    @Test
    fun `signed in with nothing unread refreshes every 60 minutes`() {
        assertThat(WidgetRefreshSchedule.intervalMinutes(signedIn = true, hasUnread = false)).isEqualTo(60)
    }

    @Test
    fun `signed out refreshes every 60 minutes whatever the cache says`() {
        assertThat(WidgetRefreshSchedule.intervalMinutes(signedIn = false, hasUnread = true)).isEqualTo(60)
    }
}
