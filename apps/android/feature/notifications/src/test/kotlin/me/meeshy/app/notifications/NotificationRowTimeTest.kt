package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import org.junit.Test

class NotificationRowTimeTest {

    private fun notification(createdAt: String): ApiNotification =
        ApiNotification(id = "n1", state = NotificationState(createdAt = createdAt))

    @Test
    fun `resolves the arrival instant from state createdAt`() {
        // 2026-07-13T06:56:34Z → 1_783_925_794_000
        val millis = NotificationRowTime.epochMillis(notification("2026-07-13T06:56:34Z"))

        assertThat(millis).isEqualTo(1_783_925_794_000L)
    }

    @Test
    fun `parses a fractional-seconds instant`() {
        val whole = NotificationRowTime.epochMillis(notification("2026-07-13T06:56:34Z"))
        val fractional = NotificationRowTime.epochMillis(notification("2026-07-13T06:56:34.000Z"))

        assertThat(fractional).isEqualTo(whole)
    }

    @Test
    fun `returns null for a blank createdAt so the row shows no timestamp`() {
        assertThat(NotificationRowTime.epochMillis(notification(""))).isNull()
    }

    @Test
    fun `returns null for an unparseable createdAt`() {
        assertThat(NotificationRowTime.epochMillis(notification("not-a-date"))).isNull()
    }

    @Test
    fun `keeps the unix epoch instant rather than treating it as absent`() {
        val millis = NotificationRowTime.epochMillis(notification("1970-01-01T00:00:00Z"))

        assertThat(millis).isEqualTo(0L)
    }
}
