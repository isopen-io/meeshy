package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure state derivation for [UnreadCountWidget] — mirrors iOS `SmallUnreadView`'s
 * branch (`count > 0` → the number; `count == 0` → "all caught up"). The Glance
 * `@Composable` content itself is UI glue (exempt, `TDD-COVERAGE.md`); this is the
 * one decision worth covering on the JVM.
 */
class UnreadWidgetPresentationTest {

    @Test
    fun `zero unread conversations resolves to the all-read state`() {
        val state = UnreadWidgetPresentation.from(totalUnread = 0)

        assertThat(state.hasUnread).isFalse()
    }

    @Test
    fun `one unread conversation resolves to the unread state with count 1`() {
        val state = UnreadWidgetPresentation.from(totalUnread = 1)

        assertThat(state.hasUnread).isTrue()
        assertThat(state.count).isEqualTo(1)
    }

    @Test
    fun `many unread conversations resolves to the unread state with the exact count`() {
        val state = UnreadWidgetPresentation.from(totalUnread = 42)

        assertThat(state.hasUnread).isTrue()
        assertThat(state.count).isEqualTo(42)
    }

    @Test
    fun `a negative total (should never happen) is clamped to the all-read state`() {
        // Defensive: totalUnreadCount() can never be negative (every summed
        // unreadCount is Room/server-sourced and non-negative), but the widget
        // must never render a negative badge if that invariant is ever broken.
        val state = UnreadWidgetPresentation.from(totalUnread = -1)

        assertThat(state.hasUnread).isFalse()
        assertThat(state.count).isEqualTo(0)
    }
}
