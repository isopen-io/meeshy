package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationListStateReducerTest {
    private fun pane(
        hasRows: Boolean = false,
        isLoading: Boolean = false,
        loadDidFail: Boolean = false,
    ) = NotificationListStateReducer.pane(hasRows = hasRows, isLoading = isLoading, loadDidFail = loadDidFail)

    @Test
    fun `a cached row shows the content whatever the network does`() {
        assertThat(pane(hasRows = true)).isEqualTo(NotificationListPane.Content)
        assertThat(pane(hasRows = true, isLoading = true)).isEqualTo(NotificationListPane.Content)
        assertThat(pane(hasRows = true, loadDidFail = true)).isEqualTo(NotificationListPane.Content)
        assertThat(pane(hasRows = true, isLoading = true, loadDidFail = true)).isEqualTo(NotificationListPane.Content)
    }

    @Test
    fun `an empty cache while loading shows the skeleton`() {
        assertThat(pane(isLoading = true)).isEqualTo(NotificationListPane.Skeleton)
    }

    @Test
    fun `the skeleton wins over a stale failure flag`() {
        assertThat(pane(isLoading = true, loadDidFail = true)).isEqualTo(NotificationListPane.Skeleton)
    }

    @Test
    fun `a failure without rows shows the error page`() {
        assertThat(pane(loadDidFail = true)).isEqualTo(NotificationListPane.Error)
    }

    @Test
    fun `nothing cached and nothing pending is the empty page`() {
        assertThat(pane()).isEqualTo(NotificationListPane.Empty)
    }
}
