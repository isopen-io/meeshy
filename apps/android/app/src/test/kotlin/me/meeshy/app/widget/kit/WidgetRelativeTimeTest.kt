package me.meeshy.app.widget.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WidgetRelativeTimeTest {
    private val now = 1_700_000_000_000L
    private fun ago(ms: Long) = WidgetRelativeTime.bucket(nowMillis = now, thenMillis = now - ms)

    @Test
    fun `under a minute is now`() {
        assertThat(ago(59_000)).isEqualTo(WidgetRelativeTime.Bucket.Now)
    }

    @Test
    fun `minutes are floored`() {
        assertThat(ago(60_000)).isEqualTo(WidgetRelativeTime.Bucket.Minutes(1))
        assertThat(ago(59 * 60_000L + 59_000)).isEqualTo(WidgetRelativeTime.Bucket.Minutes(59))
    }

    @Test
    fun `hours are floored`() {
        assertThat(ago(60 * 60_000L)).isEqualTo(WidgetRelativeTime.Bucket.Hours(1))
        assertThat(ago(23 * 3_600_000L + 1)).isEqualTo(WidgetRelativeTime.Bucket.Hours(23))
    }

    @Test
    fun `a day or more is days`() {
        assertThat(ago(24 * 3_600_000L)).isEqualTo(WidgetRelativeTime.Bucket.Days(1))
        assertThat(ago(3 * 24 * 3_600_000L)).isEqualTo(WidgetRelativeTime.Bucket.Days(3))
    }

    @Test
    fun `a future timestamp is now`() {
        assertThat(WidgetRelativeTime.bucket(now, now + 5_000)).isEqualTo(WidgetRelativeTime.Bucket.Now)
    }
}
