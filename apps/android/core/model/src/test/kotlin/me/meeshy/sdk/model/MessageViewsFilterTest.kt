package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageViewsFilterTest {
    private fun initial(read: Int, delivered: Int, receipts: Boolean = true) =
        MessageViewsFilter.initial(read, delivered, receipts)

    @Test fun `nobody served opens on Sent`() = assertThat(initial(0, 0)).isEqualTo(MessageViewsFilter.Sent)

    @Test fun `a delivered recipient opens on Delivered`() =
        assertThat(initial(0, 2)).isEqualTo(MessageViewsFilter.Delivered)

    @Test fun `one reader among ten opens on Read`() = assertThat(initial(1, 10)).isEqualTo(MessageViewsFilter.Read)

    @Test fun `hidden receipts never open on Read`() {
        assertThat(initial(3, 3, receipts = false)).isEqualTo(MessageViewsFilter.Delivered)
        assertThat(initial(0, 0, receipts = false)).isEqualTo(MessageViewsFilter.Sent)
    }

    @Test fun `readers without delivered count still count as delivered when receipts hidden`() =
        assertThat(initial(2, 0, receipts = false)).isEqualTo(MessageViewsFilter.Delivered)

    @Test fun `the tab re-settles when the server tally arrives`() {
        assertThat(initial(0, 0)).isEqualTo(MessageViewsFilter.Sent)
        assertThat(initial(1, 1)).isEqualTo(MessageViewsFilter.Read)
    }

    @Test fun `only the three media tabs are media families`() {
        assertThat(MessageViewsFilter.values().filter { it.isMediaFamily })
            .containsExactly(MessageViewsFilter.Listened, MessageViewsFilter.Watched, MessageViewsFilter.Opened)
    }
}
