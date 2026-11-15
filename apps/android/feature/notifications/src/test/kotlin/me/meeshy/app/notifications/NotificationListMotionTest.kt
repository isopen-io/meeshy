package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationListMotionTest {

    @Test
    fun `rows glide to their new place when motion is full`() {
        assertThat(NotificationListMotion.rowPlacement(reduceMotion = false)).isNotNull()
        assertThat(NotificationListMotion.animatesScrollToTop(reduceMotion = false)).isTrue()
    }

    @Test
    fun `under reduce motion rows never glide and the list jumps back to the top`() {
        assertThat(NotificationListMotion.rowPlacement(reduceMotion = true)).isNull()
        assertThat(NotificationListMotion.animatesScrollToTop(reduceMotion = true)).isFalse()
    }
}
