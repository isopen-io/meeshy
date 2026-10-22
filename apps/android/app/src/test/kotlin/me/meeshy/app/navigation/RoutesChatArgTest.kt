package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RoutesChatArgTest {
    @Test
    fun `the old chat route is unchanged without a message to highlight`() {
        assertThat(Routes.chat("c1")).isEqualTo("chat/c1")
        assertThat(Routes.chat("c1", "  ")).isEqualTo("chat/c1")
    }

    @Test
    fun `a message to highlight rides as the optional messageId argument`() {
        assertThat(Routes.chat("c1", "m 2")).isEqualTo("chat/c1?messageId=m%202")
    }

    @Test
    fun `the chat pattern declares messageId as an optional query argument`() {
        assertThat(Routes.CHAT).endsWith("?messageId={messageId}")
    }
}
